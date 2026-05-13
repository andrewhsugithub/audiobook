import { TTS_URL } from "@audiobook/shared-libs/config/env.js";
import {
  TTSResponseSchema,
  type TTSRequest,
  type TTSResponse,
} from "@audiobook/shared-libs/schema/tts.js";

export async function generateAudio(data: TTSRequest): Promise<TTSResponse> {
  const response = await fetch(TTS_URL + "/v1/audio/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(5 * 60 * 1000), // 5 minutes //? not sure if we need this, since pg-boss should handle job timeout with expireInSeconds option, but just in case to prevent hanging worker
  });

  if (!response.ok) {
    throw new Error(
      `TTS request failed (${response.status}): ${await response.text()}`,
    );
  }

  const json = await response.json();
  const parsed = TTSResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`Invalid TTS response: ${parsed.error.message}`);
  }

  const result = parsed.data;
  return result;
}
