# Audiobook

## Requirements

1. [nvm](https://github.com/nvm-sh/nvm)
2. [pnpm](https://pnpm.io/installation)
3. [Python](https://www.python.org/downloads/)
4. [uv](https://docs.astral.sh/uv/getting-started/installation/)
5. [cloudflare]
6. [supabase]
7. [sonic 3.5](https://docs.cartesia.ai/api-reference/tts/bytes) (or any TTS model of your choice, just make sure to update the TTS worker code accordingly to work with the TTS API you choose)
<details>
    <summary>Old, changed to cloudflare and supabsse</summary>

```markdown
8. [Docker](https://www.docker.com/)
9. [LocalStack](https://docs.localstack.cloud/getting-started/installation/) (for local S3 testing, optional if you have access to a real S3 bucket)
   > get pro account using github student pack [here](https://app.localstack.cloud/auth/sso/public/github?plan=student&_gl=1*1scp05j*_ga*MjA2ODY1NTk4Mi4xNzc2MTk2MjYy*_ga_4G82Z1TR2R*czE3NzcyNzc5MDEkbzYkZzAkdDE3NzcyNzc5MDEkajYwJGwwJGgwJGRXeTVFY21OczFDSTRiMkkxSlM0dko2RU5kcGcwNkhmMUZn)
10. [Terraform](https://developer.hashicorp.com/terraform/install)
```

  </details>

## Setup Instructions

1. Copy the example environment file first, paste your AWS/LocalStack credentials in `.env.local`:

```bash
cp .env.example .env.local
```

2. Install Node.js dependencies in the project root:

```bash
pnpm i
```

If use third party TTS API, skip to step 5:

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

5. Run the database migrations:

```bash
cd packages/db
npx drizzle-kit push
```

6. Create the Cloudflare Hyperdrive KV namespace and update the `.env.local` with the connection string:

```bash
npx wrangler hyperdrive create hyperdrive --connection-string=<your-connection-string> --env-file ../../.env.local
```

7. Create a user in the database for testing:

Go to supabase dashboard, go to Table editor, find the `users` table, press insert row.
Copy the user id and put it in the request body when testing the API routes.

8. Start wrangler server:

```bash
cd apps/api
pnpm dev
```

9. Test with curl or any API testing tool:

```bash
curl -X POST http://localhost:8787/upload \
  -H "Content-Type: application/json" \
  -d '{
    "userId": <USER_ID_FROM_DB>,
    "bookId": "b1111111-2222-3333-4444-555555555555",
    "title": "My Test Local Story",
    "text": "Chapter 1. It was a dark and stormy night. The audio engine started running smoothly."
  }'
```

<details>
    <summary>Old steps, changed to cloudflare and supabsse</summary>

````markdown
5. Start up the docker container for PostgreSQL and LocalStack (if using):

```bash

# remember to cd back to the project root if you're still in the tts package
pnpm docker:start

```

6. Run the terraform to setup S3 buckets:

```bash
# need to wait for localstack docker container to be up before running this
cd ./infra/environments/dev
openssl genrsa -out private_key.pem 2048
openssl rsa -pubout -in private_key.pem -out public_key.pem
terraform init -upgrade
# terraform plan # optional, see what terraform will do before applying
terraform apply -auto-approve # rerun this if u change the terraform files, it will update accordingly, see the terraform docs for more info
```

7. Start the application:

```bash
# remember to cd back to the project root if you're still in the tts package
pnpm start
```
````

</details>

## Documentation

- API documentation is available at [http://localhost:3000/docs](http://localhost:3000/docs) after starting the application.
- TTS server API documentation is available at [http://localhost:7777/docs](http://localhost:7777/docs) after starting the TTS server.

### TODO

[ ] status per chunk and per segment basis instead of whole audiobook
[ ] need to seed voices db with system local voices and also external provider voices
[ ] need to seed user db with at least one user for testing
[ ] need to integrate better auth for auth
