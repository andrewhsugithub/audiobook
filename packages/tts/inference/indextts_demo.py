from pathlib import Path

from indextts.infer import IndexTTS

"""
IndexTTS-1.5 — bilingual EN/ZH voice cloning from IndexTeam (BiliBili).
Sample rate: ~24000 Hz mono (verify checkpoints/config.yaml). ~2 GB VRAM on a 3090.

Checkpoints must be downloaded manually before first run:

  uv run --isolated --with huggingface-hub huggingface-cli download \\
    IndexTeam/IndexTTS-1.5 \\
    config.yaml bigvgan_generator.pth bpe.model dvae.pth gpt.pth unigram_12000.vocab \\
    --local-dir ./checkpoints

(Skipping bigvgan_discriminator.pth saves ~1.65 GB — it's only used for training.)

License is unconfirmed in the v1.5 model card; treat as research-only unless
you've verified terms with indexspeech@bilibili.com.
"""

PKG_DIR = Path(__file__).resolve().parent.parent
CKPT_DIR = PKG_DIR / "checkpoints"
audio_prompt_path = str(PKG_DIR / "audio" / "ref_en.wav")
text_prompt = "The darkness pressed in around us as we crept through the Forbidden Forest. Wands raised, we could hear the Death Eaters approaching. They had dark magic on their side, but we had something stronger ... hope, friendship, and the power of light."


def main():
    tts = IndexTTS(
        model_dir=str(CKPT_DIR),
        cfg_path=str(CKPT_DIR / "config.yaml"),
    )
    out_path = PKG_DIR / "test_outputs" / "test-indextts.mp3"
    tts.infer(audio_prompt_path, text_prompt, str(out_path))
    print(f"Audio saved as {out_path}")


if __name__ == "__main__":
    main()
