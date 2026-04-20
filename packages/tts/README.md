## Setup

```bash
uv sync
# or for using the fishaudio-s2-pro-mlx model
uv sync --extra fishaudio-s2-pro-mlx
# note that fishaudio-s2-pro is slower, but provides better quality and more emotion control

uv run uvicorn server:app --port 7777
uv run uvicorn server:app --port 7777 --reload # for development
# check localhost:7777/docs for API docs
```

## Voices can be found at:

- [ElevenLabs](https://elevenlabs.io/app/voice-library?use_cases=characters_animation)
- [Fish Audio](https://fish.audio/app/discovery/)
