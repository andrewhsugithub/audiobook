import os
from typing import Optional

import torch
import torchaudio as ta
from chatterbox.tts_turbo import ChatterboxTurboTTS
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

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
print("Model loaded successfully and is ready for inference!")


class GenerateRequest(BaseModel):
    text: str
    audio_prompt_path: Optional[str] = None  # Path to reference audio for voice cloning

    output_filename: str = "output.mp3"

    # Params, currently all optional with defaults, but can be set by the client for more control over generation
    repetition_penalty: float = 1.2
    min_p: float = 0.00
    top_p: float = 0.95
    exaggeration: float = 0.0
    cfg_weight: float = 0.0
    temperature: float = 0.8
    top_k: int = 1000
    norm_loudness: bool = True


@app.post("/generate")
def generate_audio(req: GenerateRequest):
    try:
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

        return {"status": "success", "file_path": output_path, "sample_rate": model.sr}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


"""
example request body:
{
  "text": "The darkness pressed in around us as we crept through the Forbidden Forest[sigh]. Wands raised, we could hear the Death Eaters approaching. They had dark magic on their side, but we had something stronger [gasp] ... hope, friendship, [clear throat] and the power of light.",
  "audio_prompt_path": "audio/harry potter.mp3"
}
"""
