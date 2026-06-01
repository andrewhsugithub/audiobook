from pathlib import Path

import torch
import torchaudio as ta
from orpheus_tts import OrpheusModel

PKG_DIR = Path(__file__).resolve().parent.parent

"""
Orpheus-3B — LLaMA-based TTS with emotion tags (canopylabs/orpheus-3b-0.1-ft).
Apache-2.0. Sample rate: 24000 Hz mono. ~6-7 GB VRAM on a 3090.

Backed by vLLM (downloads ~6 GB checkpoint + ~150 MB SNAC vocoder).
Emotion tags (inline in prompt): <laugh> <chuckle> <sigh> <cough> <sniffle>
<groan> <yawn> <gasp>. Set repetition_penalty>=1.1 for the tags to fire.

Preset voices (finetune-prod): tara, dan, zoe, zac, jess, leo, mia, julia, leah.
"""

text_prompt = "The darkness pressed in around us as we crept through the Forbidden Forest. <gasp> Wands raised, we could hear the Death Eaters approaching. They had dark magic on their side, but we had something stronger <sigh> ... hope, friendship, and the power of light."


def main():
    model = OrpheusModel(
        model_name="canopylabs/orpheus-3b-0.1-ft",
    )

    pcm = b"".join(
        model.generate_speech(
            prompt=text_prompt,
            voice="tara",
            repetition_penalty=1.3,
        )
    )

    audio = torch.frombuffer(pcm, dtype=torch.int16).float().unsqueeze(0) / 32768.0
    out_path = PKG_DIR / "test_outputs" / "test-orpheus.mp3"
    ta.save(str(out_path), audio, 24000)
    print(f"Audio saved as {out_path}")


if __name__ == "__main__":
    main()
