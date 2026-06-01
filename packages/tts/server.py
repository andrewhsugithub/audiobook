import datetime
import os
import tempfile
from enum import Enum
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse
from uuid import uuid4

import boto3
import torch
import torchaudio as ta
from botocore.config import Config as BotoConfig
from chatterbox.tts_turbo import ChatterboxTurboTTS
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, field_validator

try:
    from mlx_audio.tts.generate import generate_audio
    from mlx_audio.tts.utils import load_model

    FISHAUDIO_AVAILABLE = True
except ImportError:
    FISHAUDIO_AVAILABLE = False
    print("mlx_audio not found")

try:
    from f5_tts.api import F5TTS

    F5TTS_AVAILABLE = True
except ImportError:
    F5TTS_AVAILABLE = False
    print("f5_tts not found")

try:
    from kokoro import KPipeline

    KOKORO_AVAILABLE = True
except ImportError:
    KOKORO_AVAILABLE = False
    print("kokoro not found")

try:
    from orpheus_tts import OrpheusModel

    ORPHEUS_AVAILABLE = True
except ImportError:
    ORPHEUS_AVAILABLE = False
    print("orpheus_tts not found")

try:
    from indextts.infer import IndexTTS

    INDEXTTS_AVAILABLE = True
except ImportError:
    INDEXTTS_AVAILABLE = False
    print("indextts not found")

BASE_DIR = Path(__file__).resolve().parent
ENV = os.getenv("ENV", "local")
env_file = BASE_DIR / f"../../.env.{ENV}"
load_dotenv(env_file)
print(f"Loaded environment variables from {env_file}")

"""
Please follow OpenAI API naming conventions for the endpoints.
"""

app = FastAPI()
endpoint = os.environ.get("AWS_ENDPOINT")
s3 = boto3.client(
    "s3",
    aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID", "test"),
    aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY", "test"),
    region_name=os.environ.get("AWS_REGION", "us-east-1"),
    endpoint_url=endpoint if endpoint else None,  # for LocalStack, None for real AWS
    config=BotoConfig(signature_version="s3v4"),
)

PRESIGN_EXPIRY = 60 * 3  # 30 minutes default

device = (
    "mps"
    if torch.backends.mps.is_available()
    else "cuda" if torch.cuda.is_available() else "cpu"
)
map_location = torch.device(device)
torch_load_original = torch.load


def patched_torch_load(*args, **kwargs):
    if "map_location" not in kwargs:
        kwargs["map_location"] = map_location
    return torch_load_original(*args, **kwargs)


torch.load = patched_torch_load

print(f"Loading ChatterboxTurboTTS onto {device}...")
# TODO: should load the model in the background and return a loading status until it's ready, rather than blocking the server from starting until the model is loaded, use async loop for this
model = ChatterboxTurboTTS.from_pretrained(device=device)

model_fish = None
if FISHAUDIO_AVAILABLE:
    print(f"Loading FishAudio S2 Pro onto {device}...")
    model_fish = load_model("mlx-community/fish-audio-s2-pro-8bit")

model_f5 = None
if F5TTS_AVAILABLE:
    print(f"Loading F5-TTS onto {device}...")
    model_f5 = F5TTS(model="F5TTS_v1_Base", device=device)

model_kokoro = None
if KOKORO_AVAILABLE:
    print(f"Loading Kokoro-82M onto {device}...")
    model_kokoro = KPipeline(
        lang_code="a", repo_id="hexgrad/Kokoro-82M", device=device
    )

model_orpheus = None
if ORPHEUS_AVAILABLE:
    print("Loading Orpheus-3B (vLLM manages device placement)...")
    model_orpheus = OrpheusModel(
        model_name="canopylabs/orpheus-3b-0.1-ft",
        max_model_len=2048,
    )

model_indextts = None
if INDEXTTS_AVAILABLE:
    indextts_dir = os.environ.get("INDEXTTS_CHECKPOINTS", "./checkpoints")
    print(f"Loading IndexTTS-1.5 from {indextts_dir}...")
    model_indextts = IndexTTS(
        model_dir=indextts_dir,
        cfg_path=os.path.join(indextts_dir, "config.yaml"),
    )

print("Model loaded successfully and is ready for inference!")


class Model(str, Enum):
    chatterbox_turbo = "chatterbox-turbo"
    fishaudio_s2_pro = "fishaudio-s2-pro"
    f5_tts = "f5-tts"
    kokoro = "kokoro"
    orpheus = "orpheus"
    indextts = "indextts"


class GenerateRequest(BaseModel):
    text: str
    voiceURI: Optional[str] = None  # S3 URI reference audio for voice cloning
    targetURI: str  # S3 URI destination folder for where to upload the generated audio, e.g. "s3://bucket/test/"

    @field_validator("targetURI")
    def ensure_trailing_slash(cls, v):
        if not v.endswith("/"):
            return f"{v}/"
        return v

    # model
    model: Model = Model.chatterbox_turbo

    # Per-model extras
    voiceText: Optional[str] = None  # F5-TTS reference transcript (empty -> Whisper auto)
    voicePreset: Optional[str] = None  # Kokoro / Orpheus preset voice name

    # Params, currently all optional with defaults, but can be set by the client for more control over generation
    repetitionPenalty: float = 1.2
    min_p: float = 0.00
    top_p: float = 0.95
    exaggeration: float = 0.0
    cfgWeight: float = 0.0
    temperature: float = 0.8
    top_k: int = 1000
    normLoudness: bool = True


def download_voice(bucket: str, key: str) -> str:
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".mp3")
    tmp.close()
    dst = tmp.name
    print(f"Downloading voice file from S3: bucket={bucket}, key={key} to {dst}...")

    try:
        s3.download_file(bucket, key, dst)
        return dst
    except s3.exceptions.NoSuchKey:
        if os.path.exists(dst):
            os.remove(dst)
        raise HTTPException(
            status_code=404, detail=f"Audio file not found: s3://{bucket}/{key}"
        )
    except Exception as e:
        if os.path.exists(dst):
            os.remove(dst)
        raise HTTPException(status_code=500, detail=f"S3 download failed: {e}")


def upload_to_s3(local_path: str, bucket: str, key: str) -> tuple[str, int]:
    try:
        s3.upload_file(
            local_path, bucket, key, ExtraArgs={"ContentType": "audio/mpeg"}
        )  # ExtraArgs ensures it plays in browser instead of downloading
        print(f"Uploaded file to S3: bucket={bucket}, key={key}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"S3 upload failed: {e}")

    if "private" not in bucket:
        endpoint = os.environ.get("AWS_ENDPOINT")
        if endpoint:  # LocalStack
            url = f"{endpoint}/{bucket}/{key}"
        else:  # Real AWS
            url = f"https://{bucket}.s3.amazonaws.com/{key}"
        return url, "9999-12-31T23:59:59Z"  # effectively never expires for public files

    presigned_url = s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket, "Key": key},
        ExpiresIn=PRESIGN_EXPIRY,
    )

    expire_at = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(
        seconds=PRESIGN_EXPIRY
    )
    iso_date = expire_at.strftime("%Y-%m-%dT%H:%M:%SZ")

    return presigned_url, iso_date


def process_uri(uri: str) -> tuple[str, str]:
    parsed_uri = urlparse(uri)
    bucket = parsed_uri.netloc
    path = parsed_uri.path.lstrip("/")

    return bucket, path


@app.post("/v1/audio/speech")
def tts(req: GenerateRequest):
    output_filename = f"{uuid4().hex[:8]}.mp3"
    dst_bucket, dst_key = process_uri(req.targetURI)
    output_s3_key = f"{dst_key}{output_filename}"

    audio_path = None
    if req.voiceURI:
        voice_bucket, voice_key = process_uri(req.voiceURI)
        audio_path = download_voice(voice_bucket, voice_key)

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            output_tmp_path = os.path.join(tmpdir, output_filename)

            if req.model == Model.chatterbox_turbo:
                wav = model.generate(
                    text=req.text,
                    audio_prompt_path=audio_path,
                    # params
                    repetition_penalty=req.repetitionPenalty,
                    min_p=req.min_p,
                    top_p=req.top_p,
                    exaggeration=req.exaggeration,
                    cfg_weight=req.cfgWeight,
                    temperature=req.temperature,
                    top_k=req.top_k,
                    norm_loudness=req.normLoudness,
                )

                ta.save(output_tmp_path, wav, model.sr)

            elif req.model == Model.fishaudio_s2_pro:
                if not FISHAUDIO_AVAILABLE:
                    raise HTTPException(
                        status_code=500, detail="FishAudio S2 Pro model not available"
                    )

                generate_audio(
                    model=model_fish,
                    text=req.text,
                    ref_audio=audio_path,
                    file_prefix=output_tmp_path[:-4],  # without .mp3 extension
                    audio_format="mp3",
                    save=True,
                )

                files = [f for f in os.listdir(tmpdir) if f.endswith(".mp3")]
                if not files:
                    raise HTTPException(
                        status_code=500, detail="FishAudio failed to produce a file."
                    )

                output_tmp_path = os.path.join(tmpdir, files[0])
                print(f"Found FishAudio output at: {output_tmp_path}")

            elif req.model == Model.f5_tts:
                if not F5TTS_AVAILABLE:
                    raise HTTPException(
                        status_code=500, detail="F5-TTS model not available"
                    )
                if not audio_path:
                    raise HTTPException(
                        status_code=400,
                        detail="F5-TTS requires voiceURI (reference audio)",
                    )

                wav, sr, _ = model_f5.infer(
                    ref_file=audio_path,
                    ref_text=req.voiceText or "",  # "" -> Whisper auto-transcribe
                    gen_text=req.text,
                )
                ta.save(
                    output_tmp_path, torch.from_numpy(wav).unsqueeze(0), sr
                )

            elif req.model == Model.kokoro:
                if not KOKORO_AVAILABLE:
                    raise HTTPException(
                        status_code=500, detail="Kokoro model not available"
                    )

                voice = req.voicePreset or "af_heart"
                chunks = list(model_kokoro(req.text, voice=voice))
                if not chunks:
                    raise HTTPException(
                        status_code=500, detail="Kokoro produced no audio"
                    )
                audio = torch.cat([c[2] for c in chunks]).unsqueeze(0)
                ta.save(output_tmp_path, audio, 24000)

            elif req.model == Model.orpheus:
                if not ORPHEUS_AVAILABLE:
                    raise HTTPException(
                        status_code=500, detail="Orpheus model not available"
                    )

                voice = req.voicePreset or "tara"
                pcm = b"".join(
                    model_orpheus.generate_speech(
                        prompt=req.text,
                        voice=voice,
                        repetition_penalty=max(req.repetitionPenalty, 1.1),
                        temperature=req.temperature,
                        top_p=req.top_p,
                    )
                )
                if not pcm:
                    raise HTTPException(
                        status_code=500, detail="Orpheus produced no audio"
                    )
                audio = (
                    torch.frombuffer(pcm, dtype=torch.int16).float().unsqueeze(0)
                    / 32768.0
                )
                ta.save(output_tmp_path, audio, 24000)

            elif req.model == Model.indextts:
                if not INDEXTTS_AVAILABLE:
                    raise HTTPException(
                        status_code=500, detail="IndexTTS model not available"
                    )
                if not audio_path:
                    raise HTTPException(
                        status_code=400,
                        detail="IndexTTS requires voiceURI (reference audio)",
                    )

                model_indextts.infer(audio_path, req.text, output_tmp_path)

            file_url, expires_at = upload_to_s3(
                output_tmp_path, dst_bucket, output_s3_key
            )
    finally:
        if audio_path and os.path.exists(audio_path):
            os.remove(audio_path)

    return {
        "fileBucket": dst_bucket,
        "fileKey": output_s3_key,
        "fileUrl": file_url,
        "expiresAt": expires_at,
    }


"""
example request body for chatterbox-turbo:
{
  "text": "The darkness pressed in around us as we crept through the Forbidden Forest[sigh]. Wands raised, we could hear the Death Eaters approaching. They had dark magic on their side, but we had something stronger [gasp] ... hope, friendship, [clear throat] and the power of light.",
  "voiceURI": "s3://audiobook-local-public/voices/harry_potter.mp3",
  "targetURI": "s3://audiobook-test-public/test/"
}
example request body for fishaudio-s2-pro:
{
    "text": "(anxious)(narrator)The darkness pressed in around us as we crept through the Forbidden Forest. Wands raised, we could hear the Death Eaters approaching. (long-break)(hopeful)They had dark magic on their side, but we had something stronger, ... hope, friendship, and the power of light. (gasping)",
    "voiceURI": "s3://audiobook-local-public/voices/jean.mp3",
    "model": "fishaudio-s2-pro",
    "targetURI": "s3://audiobook-test-public/test/"
}
{
    "text": "[anxious][narrator]The darkness pressed in around us as we crept through the Forbidden Forest. Wands raised, we could hear the Death Eaters approaching. [long-break][hopeful]They had dark magic on their side, but we had something stronger, ... hope, friendship, and the power of light. [gasping]",
    "voiceURI": "s3://audiobook-local-public/voices/jean.mp3",
    "model": "fishaudio-s2-pro",
    "targetURI": "s3://audiobook-test-private/test/"
}
example request body for f5-tts (needs ref audio + ref text):
{
    "text": "The darkness pressed in around us as we crept through the Forbidden Forest.",
    "voiceURI": "s3://audiobook-local-public/voices/harry_potter.mp3",
    "voiceText": "The boy who lived. Mr. and Mrs. Dursley of number four privet drive.",
    "model": "f5-tts",
    "targetURI": "s3://audiobook-test-public/test/"
}
example request body for kokoro (preset voice, no cloning):
{
    "text": "The darkness pressed in around us as we crept through the Forbidden Forest.",
    "voicePreset": "af_heart",
    "model": "kokoro",
    "targetURI": "s3://audiobook-test-public/test/"
}
example request body for orpheus (preset voice + emotion tags):
{
    "text": "The darkness pressed in around us as we crept through the Forbidden Forest. <gasp> Wands raised, we could hear the Death Eaters approaching.",
    "voicePreset": "tara",
    "model": "orpheus",
    "targetURI": "s3://audiobook-test-public/test/"
}
example request body for indextts (voice cloning):
{
    "text": "The darkness pressed in around us as we crept through the Forbidden Forest.",
    "voiceURI": "s3://audiobook-local-public/voices/harry_potter.mp3",
    "model": "indextts",
    "targetURI": "s3://audiobook-test-public/test/"
}
"""
