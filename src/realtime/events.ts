// The Higgs Realtime wire protocol, trimmed to what the moderator uses.
// Adapted from higgs-realtime-tutorial (Apache-2.0, see src/audio/LICENSE).

/** Anything the server sends. `type` is the discriminator; the rest varies. */
export interface ServerEvent {
  type: string;
  [key: string]: unknown;
}

/** Anything we send. */
export interface ClientEvent {
  type: string;
  [key: string]: unknown;
}

export const SERVER = {
  /** The candidate's committed audio became a conversation item. */
  committed: "input_audio_buffer.committed",
  /** The text of the committed audio. Only `completed` exists — no deltas. */
  transcriptionCompleted: "conversation.item.input_audio_transcription.completed",
  /** Transcribing a committed segment failed; without handling it, the turn would wait forever. */
  transcriptionFailed: "conversation.item.input_audio_transcription.failed",
  responseCreated: "response.created",
  outputAudioDelta: "response.output_audio.delta",
  audioTranscriptDone: "response.output_audio_transcript.done",
  responseDone: "response.done",
  error: "error",
} as const;

/** Stream one ~100 ms chunk of microphone audio (base64 PCM16, 24 kHz). */
export function inputAudioAppend(base64: string): ClientEvent {
  return { type: "input_audio_buffer.append", audio: base64 };
}

/** Manual turn detection: drop audio buffered since the last commit. */
export function inputAudioClear(): ClientEvent {
  return { type: "input_audio_buffer.clear" };
}

/** Manual turn detection: the buffered audio is one candidate turn. Does not trigger a reply. */
export function inputAudioCommit(): ClientEvent {
  return { type: "input_audio_buffer.commit" };
}

/** Put a panelist's (TTS) line into the moderator's context as text. */
export function assistantTextItem(text: string): ClientEvent {
  return {
    type: "conversation.item.create",
    item: { type: "message", role: "assistant", content: [{ type: "text", text }] },
  };
}

/** Stop generating the reply in progress (the candidate cut in). */
export function responseCancel(): ClientEvent {
  return { type: "response.cancel" };
}

/** Cut an assistant audio item to what was actually heard, so Realtime's record matches it. */
export function itemTruncate(itemId: string, audioEndMs: number): ClientEvent {
  return { type: "conversation.item.truncate", item_id: itemId, content_index: 0, audio_end_ms: audioEndMs };
}

/** Ask the moderator to speak. `instructions` replaces the system prompt for this reply only. */
export function responseCreate(instructions: string): ClientEvent {
  return { type: "response.create", response: { instructions } };
}
