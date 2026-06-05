# Audiobook

Cloudflare Workers + Supabase + Cartesia pipeline that turns uploaded
text/PDFs into multi-voice audio. Monorepo (pnpm workspaces):

| Path                   | What it is                                                 |
| ---------------------- | ---------------------------------------------------------- |
| `apps/api`             | Hono on Cloudflare Workers — HTTP routes + queue consumers |
| `apps/web`             | Vite + React frontend (not yet wired to `/upload`)         |
| `packages/db`          | Drizzle schema, migrations, seeds                          |
| `packages/storage`     | S3/R2 abstraction used by the Worker                       |
| `packages/tts`         | Optional local Python TTS server (FastAPI)                 |
| `packages/shared-libs` | Cross-package env schema, types                            |

The generation pipeline:

```
upload → parser → chunker → tagging → voice-mapping → tts → hls
```

Details on each stage live in
[`.claude/skills/audiobook/`](.claude/skills/audiobook/SKILL.md).

---

## 1. Prerequisites

**Local tooling**

- [`nvm`](https://github.com/nvm-sh/nvm) — Node `v24.14.1` (matches
  [`.nvmrc`](.nvmrc)); pnpm needs ≥22.13.
- [`pnpm`](https://pnpm.io/installation)
- [`uv`](https://docs.astral.sh/uv/getting-started/installation/) +
  [Python](https://www.python.org/downloads/) — **only** if you plan to
  run the local TTS server in `packages/tts`. Skip for the default
  Cartesia path.

**Cloud accounts**

- [Cloudflare](https://dash.cloudflare.com/) — Workers, Queues, Workers
  AI, Hyperdrive (R2 optional; Supabase is the tested storage path).
- [Supabase](https://supabase.com/dashboard/projects) — Postgres + Storage.
- [Cartesia](https://docs.cartesia.ai/api-reference/tts/bytes) — TTS API
  key. (Swap for another provider by editing
  [`apps/api/src/workers/tts.ts`](apps/api/src/workers/tts.ts).)

> The historical LocalStack/Docker/Terraform path is preserved at the
> bottom of this file; ignore it unless you're deliberately reviving it.

---

## 2. One-time setup

### 2.1 Clone, env, install

```bash
nvm use                # picks up .nvmrc
cp .env.example .env   # fill in real values as you go
pnpm i                 # installs every workspace from the root
```

`.env` is the one and only env file — `wrangler dev`, drizzle-kit, and
the seed scripts all read from it. The schema is validated by Zod in
[`packages/shared-libs/schema/env.ts`](packages/shared-libs/schema/env.ts).

### 2.2 Supabase: database + storage

1. Create a project (any region).
2. **Database connection string:** Project Settings → Database →
   "Connection string" → **URI** tab. Use the **session pooler** (port
   `5432`) connection string. Paste it as both `DATABASE_URL` and
   `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` in `.env`
   (they must match — Hyperdrive uses the same string locally).
3. **Storage buckets** — Storage → New bucket. Create three:
   - `my-audiobook-public-dev` _(public)_
   - `my-audiobook-media-dev`
   - `my-audiobook-raw-uploads-dev`
4. **S3 credentials for Storage** — Project Settings → Storage → S3
   access keys → "New access key". Paste:
   - `S3_ENDPOINT` = `https://<project-ref>.storage.supabase.co/storage/v1/s3`
   - `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
   - `SUPABASE_PROJECT_ID` = `<project-ref>`
   - Leave `STORAGE_PROVIDER=supabase`.

### 2.3 Cartesia (or your TTS provider)

```dotenv
TTS_URL=https://api.cartesia.ai/tts/bytes
TTS_API_KEY=<your key>
```

### 2.4 Cloudflare: queues, Hyperdrive, login

```bash
npx wrangler login
```

**Create the six pipeline queues** (Worker can't start without them):

```bash
for q in audiobook-parser audiobook-chunking audiobook-tagging \
         audiobook-voice-mapping audiobook-tts audiobook-hls; do
  npx wrangler queues create "$q"
done
```

**Create the Hyperdrive binding** (from `apps/api` so the helper writes
into the right `.env`):

```bash
cd apps/api
npx wrangler hyperdrive create hyperdrive \
  --connection-string="$DATABASE_URL" --env-file ../../.env
cd -
```

Take the returned id and paste it into **both**:

- `.env` → `HYPERDRIVE_ID=<id>`
- [`apps/api/wrangler.jsonc`](apps/api/wrangler.jsonc) → `hyperdrive[0].id`

> Edit `wrangler.jsonc` later? Re-run `pnpm api:typegen` afterwards or
> `Cloudflare.Env` will be stale and the Worker won't compile.

### 2.5 Database schema + seed

```bash
pnpm db:push     # apply Drizzle schema to Supabase Postgres
pnpm db:seed     # ⚠️ DESTRUCTIVE: resets users + voices, seeds voices, users, and audiobooks
```

`pnpm db:seed` prompts Y/N before each reset. **It wipes the `users` and
`voices` tables**, so only run it on a fresh DB or in dev. If you only
want the voice catalog, run `pnpm --filter @audiobook/db seed:voices`.

You must have **at least one Cartesia voice** in `voices` for the
pipeline to assign per-character voices, and **at least one user row**
to test uploads. The seed gives you both; if you skip it, insert a user
manually via Supabase's Table Editor.

---

## 3. Run it

```bash
pnpm api:typegen   # generate Cloudflare.Env types (once + after wrangler edits)
pnpm api:dev       # wrangler dev on http://localhost:8787
pnpm --filter @audiobook/web dev # frontend on :3000
```

Optional, in separate terminals:

```bash
# if want to run a local TTS server instead of Cartesia
cd packages/tts && uv sync && \
  uv run uvicorn server:app --port 7777        # local TTS on :7777
```

API docs (Swagger UI): <http://localhost:8787/docs>.

---

## 4. Smoke-test the pipeline

Grab a user id from the `users` table in Supabase, then:

```bash
curl -X POST http://localhost:8787/upload \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "<USER_ID_FROM_DB>",
    "title": "Smoke test",
    "text": "\"We must hurry,\" said Hermione. Ron groaned. \"Five more minutes.\" The corridor was empty."
  }'
```

In the `wrangler dev` console you should see the message walk the chain:

```
[parser queue] …
[chunking queue] …
[tagging queue] …
[voice-mapping queue] Mapped segment "We must hurry," … speaker: Hermione emotion: … voice: <uuid>
[tts queue] ✓ Segment 0_0 …
```

In Supabase, check that `segments` rows have:

- distinct `assigned_voice_id` per speaker,
- non-`Neutral` `emotion_tag` for emoted lines,
- `content` free of any `<emotion .../>` substring.

To hear the output, hit `GET http://localhost:8787/test_get_wav` (streams
the first generated WAV) or fetch
`audiobooks/<id>/segments/seg_<chunk>_<seg>.wav` from the
`my-audiobook-media-dev` bucket directly.

---

## 5. Common issues

- **`wrangler dev` fails binding a queue** — the queue doesn't exist in
  your Cloudflare account yet. Re-run the `wrangler queues create` loop
  in §2.4.
- **`Cannot find type definition file for './worker-configuration.d.ts'`**
  — run `pnpm api:typegen`.
- **`invalid input value for enum audiobook_status`** in the Worker log
  — your DB still has the old enum. Run `pnpm db:push`. (See
  [data-model.md](.claude/skills/audiobook/reference/data-model.md).)
- **Worker throws "No Cartesia voices available"** — `voices` table is
  empty. Run `pnpm --filter @audiobook/db seed:voices`.
- **Books never reach `completed`.** Expected — the HLS / stitching
  stage isn't wired up yet. The pipeline currently stops at per-segment
  WAVs.
- **Frontend shows placeholder books.** `apps/web` isn't connected to
  the project's `/upload` API yet; it points at an external demo.

---

## Documentation

- API: <http://localhost:8787/docs> (Swagger UI via `hono-openapi`)
- Local TTS server: <http://localhost:7777/docs>
- Project skill (architecture, data model, voice flow, dev gotchas):
  [`.claude/skills/audiobook/`](.claude/skills/audiobook/SKILL.md)

---

## TODO

- [ ] add audiobook versioning for cache busting, currently deletes old segments when reupload and apply versioning on `hls` only, can't apply versioning specifically on segments since each segment is processed independently and asynchronously
- [ ] status per chunk and per segment basis instead of whole audiobook
- [ ] refactor types in frontend and backend to be shared in a common package
- [ ] (low priority) add a progress bar for the upload and TTS processing
- [ ] (super low priority) need to seed voices db with system local voices

Active work items downstream of recent PRs live in [todo.md](todo.md).

---

<details>
<summary>Historical: LocalStack / Docker / Terraform path</summary>

These steps predate the move to Cloudflare + Supabase. They are kept for
reference only and are not maintained.

**Extra prerequisites:**

8. [Docker](https://www.docker.com/)
9. [LocalStack](https://docs.localstack.cloud/getting-started/installation/) — pro account available via the GitHub Student Pack.
10. [Terraform](https://developer.hashicorp.com/terraform/install)

**Setup:**

```bash
# 1. Start Postgres + LocalStack
pnpm docker:start

# 2. Provision S3 buckets via Terraform
cd ./infra/environments/dev
openssl genrsa -out private_key.pem 2048
openssl rsa -pubout -in private_key.pem -out public_key.pem
terraform init -upgrade
terraform apply -auto-approve

# 3. Start the app
cd ../../..
pnpm start
```

</details>
