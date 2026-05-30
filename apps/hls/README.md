## test

    ```bash
    JOB_PAYLOAD='{"audiobookId":"d8bbb762-d589-4017-87b5-1d11c5251f15","outputBucket":"my-audiobook-media-dev","outputPrefix":"audiobooks/d8bbb762-d589-4017-87b5-1d11c5251f15/hls/"}' npx tsx src/index.ts
    ```

    ```bash
    docker build -f Dockerfile.hls -t audiobook-hls .
    docker run --rm --env-file .env -e JOB_PAYLOAD='{"audiobookId":"d8bbb762-d589-4017-87b5-1d11c5251f15","outputBucket":"my-audiobook-media-dev","outputPrefix":"audiobooks/d8bbb762-d589-4017-87b5-1d11c5251f15/hls/"}' audiobook-hls
    ```

    ```bash
    docker buildx create --use
    docker buildx build -f Dockerfile.hls --platform linux/amd64 -t ahsu11/audiobook-hls:latest --push .
    ```
