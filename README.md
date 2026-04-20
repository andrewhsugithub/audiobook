# Audiobook

## Requirements

1. [nvm](https://github.com/nvm-sh/nvm)
2. [pnpm](https://pnpm.io/installation)
3. [Python](https://www.python.org/downloads/)
4. [uv](https://docs.astral.sh/uv/getting-started/installation/)
5. [Docker](https://www.docker.com/)

## Setup Instructions

1. Copy the example environment file first:

```bash
cp .env.example .env.local
```

2. Install Node.js dependencies in the project root:

```bash
pnpm i
```

3. Install Python dependencies for the TTS model:

```bash
cd packages/tts
uv sync
```

See [packages/models/tts/README.md](packages/models/tts/README.md) for more information.

4. Start the TTS server:

```bash
cd packages/tts
uv run uvicorn server:app --port 7777
```

5. Start the application from the project root:

```bash
pnpm start
```
