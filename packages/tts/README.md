## Setup

```bash
uv sync
# or for using the fishaudio-s2-pro-mlx model (Apple Silicon only)
uv sync --extra fishaudio-s2-pro-mlx
# note that fishaudio-s2-pro is slower, but provides better quality and more emotion control

uv run uvicorn server:app --port 7777
uv run uvicorn server:app --port 7777 --reload # for development
# check localhost:7777/docs for API docs
```

## Local models for a CUDA box (tested target: RTX 3090, 24 GB)

Each model is behind its own `uv` extra because the dependency stacks don't cleanly co-exist (`orpheus` pins `vllm==0.7.3`, `indextts` is a git-only install). The server tries to import each one at boot and silently skips any whose package is missing — so you only install the engines you actually want.

| Model | Extra | VRAM | Voice cloning | Notes |
| --- | --- | --- | --- | --- |
| `f5-tts` | `--extra f5-tts` | ~1.5 GB | yes (needs ref text) | Weights are CC-BY-NC-4.0. Needs `ffmpeg`. |
| `kokoro` | `--extra kokoro` | <1 GB | no — preset voices | Apache-2.0. Needs `espeak-ng`. |
| `orpheus` | `--extra orpheus` | ~6-7 GB | preset voices + emotion tags | Apache-2.0. Pulls vLLM, Linux + CUDA only. |
| `indextts` | `--extra indextts` | ~2 GB | yes (EN/ZH) | License unconfirmed — treat as research-only. Checkpoints need a manual `huggingface-cli download`. |

Install one engine:

```bash
uv sync --extra f5-tts
uv sync --extra kokoro
uv sync --extra orpheus    # heavy: vLLM build + ~6 GB checkpoint
uv sync --extra indextts   # also requires manual checkpoint download (see below)
```

Install all the lightweight CUDA models in one shot (skips orpheus to avoid the vLLM pin):

```bash
uv sync --extra cuda-all
```

### System packages

```bash
sudo apt install ffmpeg espeak-ng
```

### IndexTTS checkpoint download

IndexTTS-1.5 does not ship its weights via PyPI — pull them yourself once:

```bash
huggingface-cli download IndexTeam/IndexTTS-1.5 \
  config.yaml bigvgan_generator.pth bpe.model dvae.pth gpt.pth unigram_12000.vocab \
  --local-dir ./checkpoints
```

Point the server at a different directory with `INDEXTTS_CHECKPOINTS=/path/to/checkpoints`.

## API extras

`POST /v1/audio/speech` gained two optional fields:

- `voiceText` — reference transcript used by F5-TTS. Leave empty and F5 falls back to Whisper to auto-transcribe (uses extra VRAM).
- `voicePreset` — preset voice name for Kokoro (e.g. `af_heart`) and Orpheus (e.g. `tara`, `dan`, `zoe`).

See the bottom of `server.py` for one example request body per model.

## Voices can be found at:

- [ElevenLabs](https://elevenlabs.io/app/voice-library?use_cases=characters_animation)
- [Fish Audio](https://fish.audio/app/discovery/)
- Kokoro preset voices: [VOICES.md](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md)
