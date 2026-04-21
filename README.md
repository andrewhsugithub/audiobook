# Audiobook

## Requirements

1. [nvm](https://github.com/nvm-sh/nvm)
2. [pnpm](https://pnpm.io/installation)
3. [Python](https://www.python.org/downloads/)
4. [uv](https://docs.astral.sh/uv/getting-started/installation/)
5. [Docker](https://www.docker.com/)
6. [LocalStack](https://docs.localstack.cloud/getting-started/installation/) (for local S3 testing, optional if you have access to a real S3 bucket)
   > get pro account using github student pack
7. [Terraform](https://developer.hashicorp.com/terraform/install)

## Setup Instructions

1. Copy the example environment file first, paste your AWS/LocalStack credentials in `.env.local`:

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

See [packages/tts/README.md](packages/tts/README.md) for more information.

4. Start the TTS server:

```bash
cd packages/tts
uv run uvicorn server:app --port 7777
```

5. Start the application from the project root:

```bash
# remember to cd back to the project root if you're still in the tts package
pnpm docker:start
bash ./terraform-setup.sh # need to wait for localstack docker container to be up before running this
pnpm start
```

## Documentation

- API documentation is available at [http://localhost:3000/docs](http://localhost:3000/docs) after starting the application.
- TTS server API documentation is available at [http://localhost:7777/docs](http://localhost:7777/docs) after starting the TTS server.
