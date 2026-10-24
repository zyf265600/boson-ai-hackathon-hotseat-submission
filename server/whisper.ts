// Transcription with Whisper, the first choice for the candidate's answers: Higgs
// STT failed on about half of all segments on 2026-10-23 (it sends "the
// transcription is not available right now" about 3 s after the commit), so its
// transcript is only the backup (src/realtime/ModeratorClient.ts). Whisper runs on
// this machine as whisper.cpp's whisper-server (`npm run dev:whisper`), so it needs no key.

import { LANGUAGES, type Language } from "../shared/languages";

/** whisper-server's address; `npm run dev:whisper` starts it here. */
const WHISPER_URL = process.env.WHISPER_URL?.trim() || "http://127.0.0.1:8178";
/** Whisper takes ~0.5 s (~1.2 s past 30 s of audio); past this Higgs's transcript is used. */
const TIMEOUT_MS = 5000;

/** The browser's audio rate (Higgs Realtime's), and the rate whisper.cpp needs. */
const IN_RATE = 24000;
const OUT_RATE = 16000;

/** Transcribe raw PCM16 / 24 kHz / mono speech in `lang`; rejects if Whisper is not running or fails. */
export async function transcribe(pcm: Buffer, lang: Language = "en"): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([wav16k(pcm)], { type: "audio/wav" }), "answer.wav");
  form.append("language", LANGUAGES[lang].stt);
  // Whisper writes Mandarin in traditional characters at times ("慢慢來,不著急"), which the simplified
  // rule words (corpus/lang/zh.ts) then miss; a simplified-Chinese prompt steers it (2026-10-23).
  if (lang === "zh") form.append("prompt", "以下是普通话的句子。");
  form.append("temperature", "0");
  form.append("response_format", "json");
  const res = await fetch(`${WHISPER_URL}/inference`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Whisper ${res.status}: ${await res.text()}`);
  const { text } = (await res.json()) as { text?: string };
  // whisper-server joins its own segments with newlines.
  return (text ?? "").replace(/\s+/g, " ").trim();
}

/** 24 kHz PCM16 to a 16 kHz PCM16 WAV file, by linear interpolation (speech has little above 8 kHz). */
function wav16k(pcm: Buffer): Buffer {
  const input = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2));
  const n = Math.floor((input.length * OUT_RATE) / IN_RATE);
  const out = Buffer.alloc(44 + n * 2);
  for (let i = 0; i < n; i++) {
    const pos = (i * IN_RATE) / OUT_RATE;
    const j = Math.floor(pos);
    const next = input[Math.min(j + 1, input.length - 1)];
    out.writeInt16LE(Math.round(input[j] + (next - input[j]) * (pos - j)), 44 + i * 2);
  }
  out.write("RIFF", 0);
  out.writeUInt32LE(36 + n * 2, 4);
  out.write("WAVEfmt ", 8);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20); // PCM
  out.writeUInt16LE(1, 22); // mono
  out.writeUInt32LE(OUT_RATE, 24);
  out.writeUInt32LE(OUT_RATE * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write("data", 36);
  out.writeUInt32LE(n * 2, 40);
  return out;
}
