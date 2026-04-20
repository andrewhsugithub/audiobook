import datetime
import os
import tempfile
from enum import Enum
from pathlib import Path
from typing import Optional
from uuid import uuid4

import boto3
import torch
import torchaudio as ta
from botocore.config import Config as BotoConfig
from chatterbox.tts_turbo import ChatterboxTurboTTS
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

try:
    from mlx_audio.tts.generate import generate_audio
    from mlx_audio.tts.utils import load_model

    FISHAUDIO_AVAILABLE = True
except ImportError:
    FISHAUDIO_AVAILABLE = False
    print("mlx_audio not found")

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

PRIVATE_BUCKET = os.environ.get("S3_PRIVATE_BUCKET", "audiobook-local-private")
PUBLIC_BUCKET = os.environ.get("S3_PUBLIC_BUCKET", "audiobook-local-public")
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
if FISHAUDIO_AVAILABLE:
    print(f"Loading FishAudio S2 Pro onto {device}...")
    model_fish = load_model("mlx-community/fish-audio-s2-pro-8bit")
print("Model loaded successfully and is ready for inference!")


class Model(str, Enum):
    chatterbox_turbo = "chatterbox-turbo"
    fishaudio_s2_pro = "fishaudio-s2-pro"


class GenerateRequest(BaseModel):
    text: str
    voiceS3Key: Optional[str] = None  # S3 key for reference audio for voice cloning
    outputS3KeyPrefix: str  # S3 key prefix for where to upload the generated audio, e.g. "test/" or "users/123/"
    isPublic: bool = False  # whether to upload to public bucket or private bucket

    # model
    model: Model = Model.chatterbox_turbo  # or Model.fishaudio_s2_pro

    # Params, currently all optional with defaults, but can be set by the client for more control over generation
    repetitionPenalty: float = 1.2
    min_p: float = 0.00
    top_p: float = 0.95
    exaggeration: float = 0.0
    cfgWeight: float = 0.0
    temperature: float = 0.8
    top_k: int = 1000
    normLoudness: bool = True


def download_voice(s3_key: str) -> str:
    bucket = PRIVATE_BUCKET if s3_key.startswith("users/") else PUBLIC_BUCKET

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".mp3")
    tmp.close()
    path = tmp.name
    print(f"Downloading voice file from S3: bucket={bucket}, key={s3_key} to {path}...")

    try:
        s3.download_file(bucket, s3_key, path)
        return path
    except s3.exceptions.NoSuchKey:
        if os.path.exists(path):
            os.remove(path)
        raise HTTPException(status_code=404, detail=f"Audio file not found: {s3_key}")
    except Exception as e:
        if os.path.exists(path):
            os.remove(path)
        raise HTTPException(status_code=500, detail=f"S3 download failed: {e}")


def upload_to_s3(local_path: str, s3_key: str, is_public: bool) -> tuple[str, int]:
    bucket = PRIVATE_BUCKET if not is_public else PUBLIC_BUCKET
    try:
        s3.upload_file(
            local_path, bucket, s3_key, ExtraArgs={"ContentType": "audio/mpeg"}
        )  # ExtraArgs ensures it plays in browser instead of downloading
        print(f"Uploaded file to S3: bucket={bucket}, key={s3_key}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"S3 upload failed: {e}")

    if is_public:
        endpoint = os.environ.get("AWS_ENDPOINT")
        if endpoint:  # LocalStack
            url = f"{endpoint}/{bucket}/{s3_key}"
        else:  # Real AWS
            url = f"https://{bucket}.s3.amazonaws.com/{s3_key}"
        return url, "9999-12-31T23:59:59Z"  # effectively never expires for public files

    presigned_url = s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket, "Key": s3_key},
        ExpiresIn=PRESIGN_EXPIRY,
    )

    expire_at = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(
        seconds=PRESIGN_EXPIRY
    )
    iso_date = expire_at.strftime("%Y-%m-%dT%H:%M:%SZ")

    return presigned_url, iso_date


@app.post("/v1/audio/speech")
def tts(req: GenerateRequest):
    output_filename = f"{uuid4().hex[:8]}.mp3"
    output_s3_key = f"{req.outputS3KeyPrefix}{output_filename}"

    audio_path = None
    if req.voiceS3Key:
        audio_path = download_voice(req.voiceS3Key)

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
                print(f"✅ Found FishAudio output at: {output_tmp_path}")

            file_url, expires_at = upload_to_s3(
                output_tmp_path, output_s3_key, req.isPublic
            )
    finally:
        if audio_path and os.path.exists(audio_path):
            os.remove(audio_path)

    return {
        "fileKey": output_s3_key,
        "fileUrl": file_url,
        "expiresAt": expires_at,
    }


"""
example request body for chatterbox-turbo:
{
  "text": "The darkness pressed in around us as we crept through the Forbidden Forest[sigh]. Wands raised, we could hear the Death Eaters approaching. They had dark magic on their side, but we had something stronger [gasp] ... hope, friendship, [clear throat] and the power of light.",
  "voiceS3Key": "voices/harry_potter.mp3",
  "outputS3KeyPrefix": "test/",
  "isPublic": true
}
example request body for fishaudio-s2-pro:
{
    "text": "(anxious)(narrator)The darkness pressed in around us as we crept through the Forbidden Forest. Wands raised, we could hear the Death Eaters approaching. (long-break)(hopeful)They had dark magic on their side, but we had something stronger, ... hope, friendship, and the power of light. (gasping)",
    "voiceS3Key": "voices/jean.mp3",
    "model": "fishaudio-s2-pro",
    "outputS3KeyPrefix": "test/",
    "isPublic": true
}
{
    "text": "[anxious][narrator]The darkness pressed in around us as we crept through the Forbidden Forest. Wands raised, we could hear the Death Eaters approaching. [long-break][hopeful]They had dark magic on their side, but we had something stronger, ... hope, friendship, and the power of light. [gasping]",
    "voiceS3Key": "voices/jean.mp3",
    "model": "fishaudio-s2-pro",
    "outputS3KeyPrefix": "test/",
    "isPublic": true
}
"""
