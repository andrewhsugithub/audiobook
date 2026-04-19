import os
from enum import Enum
from typing import Optional

import torch
import torchaudio as ta
from chatterbox.tts_turbo import ChatterboxTurboTTS
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

try:
    from mlx_audio.tts.generate import generate_audio
    from mlx_audio.tts.utils import load_model

    FISHAUDIO_AVAILABLE = True
except ImportError:
    FISHAUDIO_AVAILABLE = False
    print("mlx_audio not found")


"""
Please follow OpenAI API naming conventions for the endpoints.
"""

app = FastAPI()

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
    audio_prompt_path: Optional[str] = None  # Path to reference audio for voice cloning

    output_filename: str = "output.mp3"

    # model
    model: Model = Model.chatterbox_turbo  # or Model.fishaudio_s2_pro

    # Params, currently all optional with defaults, but can be set by the client for more control over generation
    repetition_penalty: float = 1.2
    min_p: float = 0.00
    top_p: float = 0.95
    exaggeration: float = 0.0
    cfg_weight: float = 0.0
    temperature: float = 0.8
    top_k: int = 1000
    norm_loudness: bool = True


@app.post("/v1/audio/speech")
def tts(req: GenerateRequest):
    try:
        if req.model == Model.chatterbox_turbo:
            wav = model.generate(
                text=req.text,
                audio_prompt_path=req.audio_prompt_path,
                # params
                repetition_penalty=req.repetition_penalty,
                min_p=req.min_p,
                top_p=req.top_p,
                exaggeration=req.exaggeration,
                cfg_weight=req.cfg_weight,
                temperature=req.temperature,
                top_k=req.top_k,
                norm_loudness=req.norm_loudness,
            )

            os.makedirs("./output", exist_ok=True)
            output_path = f"./output/{req.output_filename}"
            ta.save(output_path, wav, model.sr)

        elif req.model == Model.fishaudio_s2_pro:
            if not FISHAUDIO_AVAILABLE:
                raise HTTPException(
                    status_code=500, detail="FishAudio S2 Pro model not available"
                )

            output_path = f"./output/{req.output_filename}"
            generate_audio(
                model=model_fish,
                text=req.text,
                ref_audio=req.audio_prompt_path,
                file_prefix=output_path[:-4],  # without .mp3 extension
                audio_format="mp3",
                save=True,
            )

        return {"status": "success", "file_path": output_path, "sample_rate": model.sr}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


"""
example request body for chatterbox-turbo:
{
  "text": "The darkness pressed in around us as we crept through the Forbidden Forest[sigh]. Wands raised, we could hear the Death Eaters approaching. They had dark magic on their side, but we had something stronger [gasp] ... hope, friendship, [clear throat] and the power of light.",
  "audio_prompt_path": "audio/harry potter.mp3"
}
example request body for fishaudio-s2-pro:
{
    "text": "(anxious)(narrator)The darkness pressed in around us as we crept through the Forbidden Forest. Wands raised, we could hear the Death Eaters approaching. (long-break)(hopeful)They had dark magic on their side, but we had something stronger, ... hope, friendship, and the power of light. (gasping)",
    "audio_prompt_path": "audio/voice_preview_jean - alluring and playful femme fatale.mp3",
    "model": "fishaudio-s2-pro"
}
{
    "text": "[anxious][narrator]The darkness pressed in around us as we crept through the Forbidden Forest. Wands raised, we could hear the Death Eaters approaching. [long-break][hopeful]They had dark magic on their side, but we had something stronger, ... hope, friendship, and the power of light. [gasping]",
    "audio_prompt_path": "audio/voice_preview_jean - alluring and playful femme fatale.mp3",
    "model": "fishaudio-s2-pro"
}
"""
