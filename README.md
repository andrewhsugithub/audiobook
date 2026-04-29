# Audiobook

## Requirements

1. [nvm](https://github.com/nvm-sh/nvm)
2. [pnpm](https://pnpm.io/installation)
3. [Python](https://www.python.org/downloads/)
4. [uv](https://docs.astral.sh/uv/getting-started/installation/)
5. [Docker](https://www.docker.com/)
6. [LocalStack](https://docs.localstack.cloud/getting-started/installation/) (for local S3 testing, optional if you have access to a real S3 bucket)
   > get pro account using github student pack [here](https://app.localstack.cloud/auth/sso/public/github?plan=student&_gl=1*1scp05j*_ga*MjA2ODY1NTk4Mi4xNzc2MTk2MjYy*_ga_4G82Z1TR2R*czE3NzcyNzc5MDEkbzYkZzAkdDE3NzcyNzc5MDEkajYwJGwwJGgwJGRXeTVFY21OczFDSTRiMkkxSlM0dko2RU5kcGcwNkhmMUZn)
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

5. Start up the docker container for PostgreSQL and LocalStack (if using):

```bash
# remember to cd back to the project root if you're still in the tts package
pnpm docker:start
```

6. Run the terraform to setup S3 buckets:

````bash
# need to wait for localstack docker container to be up before running this
cd ./infra/environments/local
terraform init
terraform apply -auto-approve # rerun this if u change the terraform files, it will update accordingly, see the terraform docs for more info
```

7. Start the application:
``` bash
# remember to cd back to the project root if you're still in the tts package
pnpm start
````

## Documentation

- API documentation is available at [http://localhost:3000/docs](http://localhost:3000/docs) after starting the application.
- TTS server API documentation is available at [http://localhost:7777/docs](http://localhost:7777/docs) after starting the TTS server.
