## test

- test on local machine:

  ```bash
  JOB_PAYLOAD='{"audiobookId":"d8bbb762-d589-4017-87b5-1d11c5251f15","outputBucket":"my-audiobook-media-dev","outputPrefix":"audiobooks/d8bbb762-d589-4017-87b5-1d11c5251f15/hls/"}' npx tsx src/index.ts
  ```

- test with github actions locally:

  ```bash
  # cd to project root
  act repository_dispatch -e ./apps/hls/test-event.json --secret-file .env --container-architecture linux/amd64 -W .github/workflows/hls.yml --bind=false
  ```

  > must choose medium or large image

```bash
curl -X POST https://api.github.com/repos/andrewhsugithub/audiobook/dispatches \
  -H "Accept: application/vnd.github.v3+json" \
  -H "Authorization: Bearer <GITHUB_PERSONAL_ACCESS_TOKEN>" \
  -H "X-Github-Api-Version: 2026-03-10" \
  -H "User-Agent: Cloudflare HLS Queue" \
  -d '{"event_type":"trigger-hls","client_payload":{"audiobookId":"99015780-b9cd-4206-ab58-85b866a26f12","outputBucket":"my-audiobook-media-dev","outputPrefix":"audiobooks/99015780-b9cd-4206-ab58-85b866a26f12/hls/"}}'

```

- test with docker:
  ```bash
  docker build -f Dockerfile.hls -t audiobook-hls .
  docker run --rm --env-file .env -e JOB_PAYLOAD='{"audiobookId":"d8bbb762-d589-4017-87b5-1d11c5251f15","outputBucket":"my-audiobook-media-dev","outputPrefix":"audiobooks/d8bbb762-d589-4017-87b5-1d11c5251f15/hls/"}' audiobook-hls
  ```

## deploy docker image to docker hub

    ```bash
    docker buildx create --use
    docker buildx build -f Dockerfile.hls --platform linux/amd64 -t <username>/audiobook-hls:latest --push .
    ```
