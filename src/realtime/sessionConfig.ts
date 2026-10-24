import type { ClientEvent } from "./events";
import { VOICES } from "../../shared/panel";
import { LANGUAGES, type Language } from "../../shared/languages";
import { pack } from "../../corpus/lang";

/** PCM16 at 24 kHz in both directions; Higgs TTS 3 streams the same format. */
export const AUDIO_RATE = 24000;

/**
 * The moderator's session instructions, in the interview language (corpus/lang/<code>.ts
 * `moderatorPrompt`): a three-person panel's moderator who opens, closes and keeps the
 * interview moving in one or two short spoken sentences, and speaks only that language.
 */
export const moderatorPrompt = (lang: Language) => pack(lang).moderatorPrompt;

/**
 * The first session.update. `voice`: the moderator's voice from the prep room (a preset
 * or a registered "voice_…"); Realtime refuses an unknown one before session.created
 * (ModeratorClient.connect, VoiceRefusedError).
 */
export function buildSessionConfig(lang: Language = "en", voice: string = VOICES.moderator): ClientEvent {
  return {
    type: "session.update",
    session: {
      model: "higgs-realtime",
      instructions: moderatorPrompt(lang),
      output_modalities: ["audio"],
      audio: {
        input: {
          format: { type: "audio/pcm", rate: AUDIO_RATE },
          // Manual turns. With server_vad the model ALWAYS replies at the end of
          // a user turn (create_response is ignored), but the candidate also
          // answers the TTS panelists — so the app decides when the moderator
          // speaks: commit the turn, then send response.create only when wanted.
          turn_detection: null,
          transcription: { model: "higgs-stt-3.1", language: LANGUAGES[lang].stt },
        },
        output: {
          format: { type: "audio/pcm", rate: AUDIO_RATE },
          voice,
        },
      },
    },
  };
}
