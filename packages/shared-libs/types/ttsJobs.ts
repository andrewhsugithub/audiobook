import { type TTSRequest } from "../schema/tts.js";

export type TTSJob = {
  id: string;
  data: TTSRequest;
};
