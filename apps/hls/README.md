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

  > must choose medium or large image:
  > if use medium: must install ffmpeg byself in workflow
  > if use large: ffmpeg is preinstalled

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
