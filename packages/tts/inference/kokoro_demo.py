import torch
import torchaudio as ta
from kokoro import KPipeline

"""
Kokoro-82M — small Apache-2.0 model from hexgrad/Kokoro-82M.
Sample rate: 24000 Hz mono. <1 GB VRAM. No voice cloning — preset voices only.

Lang codes: 'a' (American English), 'b' (British English), 'j' (Japanese, needs misaki[ja]),
'z' (Mandarin, needs misaki[zh]), 'e' (Spanish), 'f' (French), 'h' (Hindi),
'i' (Italian), 'p' (Brazilian Portuguese).

System dep: espeak-ng (apt install espeak-ng) for OOV fallback.
Preset voice list: https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md
"""

text_prompt = "The darkness pressed in around us as we crept through the Forbidden Forest. Wands raised, we could hear the Death Eaters approaching. They had dark magic on their side, but we had something stronger ... hope, friendship, and the power of light."


def main():
    device = "cuda" if torch.cuda.is_available() else "cpu"
    pipeline = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M", device=device)

    chunks = list(pipeline(text_prompt, voice="af_heart"))
    audio = torch.cat([c[2] for c in chunks]).unsqueeze(0)  # [1, T]

    ta.save("test-kokoro.mp3", audio, 24000)
    print("Audio saved as test-kokoro.mp3")


if __name__ == "__main__":
    main()
