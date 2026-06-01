from pathlib import Path

import torch
import torchaudio as ta
from f5_tts.api import F5TTS

"""
F5-TTS — zero-shot voice cloning diffusion model (SWivid/F5-TTS).
Weights: CC-BY-NC-4.0 (non-commercial). Code: MIT.
Sample rate: 24000 Hz mono. ~1.5 GB VRAM on a 3090.

Always needs a reference audio + reference text. Leave ref_text="" to
auto-transcribe with Whisper (costs extra VRAM).
"""

PKG_DIR = Path(__file__).resolve().parent.parent
audio_prompt_path = str(PKG_DIR / "audio" / "ref_en.wav")
ref_text = "Some call me nature, others call me mother nature."

gen_text = "The darkness pressed in around us as we crept through the Forbidden Forest. Wands raised, we could hear the Death Eaters approaching. They had dark magic on their side, but we had something stronger ... hope, friendship, and the power of light."


def main():
    device = "cuda" if torch.cuda.is_available() else "cpu"
    tts = F5TTS(model="F5TTS_v1_Base", device=device)
    wav, sr, _ = tts.infer(
        ref_file=audio_prompt_path,
        ref_text=ref_text,
        gen_text=gen_text,
    )
    out_path = PKG_DIR / "test_outputs" / "test-f5.mp3"
    ta.save(str(out_path), torch.from_numpy(wav).unsqueeze(0), sr)
    print(f"Audio saved as {out_path} (sr={sr})")


if __name__ == "__main__":
    main()
