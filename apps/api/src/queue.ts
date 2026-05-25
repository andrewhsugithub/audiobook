import { handleChunkingQueue } from "./workers/chunker";
import { handleParserQueue } from "./workers/parser";
import { handleTaggingQueue } from "./workers/tagging";
import { handleVoiceMappingQueue } from "./workers/voiceMapper";
import { handleTTSQueue } from "./workers/tts";

export async function queue(
  batch: MessageBatch<any>,
  env: Cloudflare.Env,
  ctx: ExecutionContext,
): Promise<void> {
  console.log(
    `[queue] Received batch from "${batch.queue}" containing ${batch.messages.length} messages.`,
  );

  const handlers: Record<
    string,
    ExportedHandlerQueueHandler<CloudflareBindings, any>
  > = {
    "audiobook-parser": handleParserQueue,
    "audiobook-chunking": handleChunkingQueue,
    "audiobook-tagging": handleTaggingQueue,
    "audiobook-voice-mapping": handleVoiceMappingQueue,
    "audiobook-tts": handleTTSQueue,
  };

  const handler = handlers[batch.queue];

  // 2. Dead-letter Guard Fallback
  if (!handler) {
    console.warn(
      `[queue] Critical: No handler registered to consume messages from queue: "${batch.queue}"`,
    );

    // If a message routes here with no handler, acknowledge and drop it
    // to prevent an endless poison-pill crash loop.
    for (const msg of batch.messages) {
      msg.ack();
    }
    return;
  }

  try {
    await handler(batch, env, ctx);
  } catch (error) {
    console.error(
      `[queue] Operational failure encountered within processing pipeline "${batch.queue}":`,
      error,
    );

    batch.retryAll();
  }
}
