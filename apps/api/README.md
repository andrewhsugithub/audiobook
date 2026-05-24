```txt
npm install
npm run dev
```

```txt
npm run deploy
```

[For generating/synchronizing types based on your Worker configuration run](https://developers.cloudflare.com/workers/wrangler/commands/#types):

```txt
npm run cf-typegen
```

Pass the `CloudflareBindings` as generics when instantiating `Hono`:

```ts
// src/index.ts
const app = new Hono<{ Bindings: CloudflareBindings }>();
```

```
[User Upload API]
       │
       ▼ (Triggers via Webhook or API)
┌─────────────────────────────────┐
│ 1. Parse File Worker            │ ◄── Reads PDF/Txt from R2, parses text
└─────────────────────────────────┘
       │ (Publishes to 'audiobook-chunks')
       ▼
┌─────────────────────────────────┐
│ 2. Chunking & Tagging Worker    │ ◄── LLM splits text, identifies speakers & emotions
└─────────────────────────────────┘
       │ (Publishes to 'audiobook-voice-map')
       ▼
┌─────────────────────────────────┐
│ 3. Voice Mapping Worker         │ ◄── LLM maps speakers to system/custom Voice IDs
└─────────────────────────────────┘
       │ (Publishes to 'audiobook-tts')
       ▼
┌─────────────────────────────────┐
│ 4. TTS Generation Worker        │ ◄── Cloudflare AI generates audio fragments
└─────────────────────────────────┘
       │ (Publishes to 'audiobook-hls')
       ▼
┌─────────────────────────────────┐
│ 5. HLS Packaging Worker         │ ◄── Combines audio fragments, outputs HLS structure
└─────────────────────────────────┘
       │
       ▼ (Final Audiobook Available for Streaming)
```

```
my-audiobook-public-dev/
├── system-voices/ ◄── CDN Cache Behavior: OPEN PUBLIC
│ └── {voice_id}.mp3 ◄── Global default platform narrators
├── covers/ ◄── CDN Cache Behavior: OPEN PUBLIC
│ └── {book_id}.jpg ◄── Thumbnails render instantly everywhere
└── audiobooks/ ◄── CDN Cache Behavior: OPEN PUBLIC
       └── {book_id}.pdf

my-audiobook-raw-uploads-dev/
└── raw-uploads/
    └── {user_id}/
        └── {book_id}.pdf/.txt ◄── Strictly private server processing intake

my-audiobook-media-dev/
├── custom-voices/ ◄── CDN Cache Behavior: SIGNED SECURE
│ └── {user_id}/
│ └── {voice_id}.mp3 ◄── Voice profiles isolated strictly by owner
└── audiobooks/ ◄── CDN Cache Behavior: SIGNED SECURE
       └── {book_id}/ ◄── Flat layout supports both public & private toggles
              ├── parsed.txt
              ├── chunks/ ◄── optional intermediate storage of text chunks for debugging
              │ ├── chunk_0001.txt
              │ ├── tagged_chunk_0001.txt
              │ ├── chunk_0002.txt
              │ ├── tagged_chunk_0002.txt
              │ └── ...
              ├── segments/ ◄── optional intermediate storage of audio segments from tts, used to stitch by hls packager
              │ ├── seg_10000.wav
              │ ├── seg_10001.wav
              │ └── ...
              ├── audiobook.m3u8
              └── chapters/ ◄── currently no chapter-level granularity but leaves room for future expansion
                     └── ch_01/
                     ├── index.m3u8
                     ├── init.mp4
                     └── seg_001.m4s
```

### TODO:

- [ ] need a queue that polls status from db and see which audiobook is not finished then trigger the next step in the pipeline
- [ ] check/fix/refactor multipart uploading
- [ ] fix hls sequencing, currently the order may be wrong since workers are async, currently it's `{chunkNumber}_{sequence in chunk}`
- [ ] add voice mapping worker, discuss the order of voice mapping worker, should the voice mapping have context of the whole book or just the chunk?
- [ ] refactor all worker queues to extract the service logic to /services folder and keep the worker files just for queue handling and orchestration
- [ ] consider parsing by chapter
