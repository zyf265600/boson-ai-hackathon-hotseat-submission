// Calls to Boson AI: the browser's Realtime key, Higgs TTS 3 speech and Higgs Avatar video.

import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { EMOTIONS } from "./questions";
import { LANGUAGES, type Language } from "../shared/languages";

const BOSON_BASE_URL = process.env.BOSON_BASE_URL ?? "https://api.boson.ai";
const BOSON_API_KEY = process.env.BOSON_API_KEY?.trim();

/** Boson answered with an error; `status` is its HTTP status, passed on to the browser. */
export class BosonError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function bosonHeaders(): Record<string, string> {
  if (!BOSON_API_KEY) throw new Error("BOSON_API_KEY is not set in .env");
  return { Authorization: `Bearer ${BOSON_API_KEY}`, "Content-Type": "application/json" };
}

/**
 * A short-lived Realtime key for the browser, so the real Boson key never
 * leaves this server (pattern from higgs-realtime-tutorial).
 */
export async function createRealtimeToken(): Promise<string> {
  const upstream = await fetch(`${BOSON_BASE_URL}/v1/realtime/client_secrets`, {
    method: "POST",
    headers: bosonHeaders(),
    body: JSON.stringify({ expires_after: { seconds: 600 } }),
  });
  const text = await upstream.text();
  if (!upstream.ok) throw new BosonError(upstream.status, text);
  return JSON.parse(text).value;
}

/**
 * Start speaking `text` in `voice` with Higgs TTS 3; resolves with the audio
 * stream, raw PCM16 / 24 kHz / mono. An unknown `emotion` is left out. `lang`: the
 * interview language.
 */
export async function streamSpeech(
  text: string,
  voice: string,
  emotion?: string,
  lang: Language = "en",
): Promise<ReadableStream<Uint8Array>> {
  const upstream = await fetch(`${BOSON_BASE_URL}/v1/audio/speech`, {
    method: "POST",
    headers: bosonHeaders(),
    body: JSON.stringify({ ...speechRequest(text, voice, emotion, lang), response_format: "pcm", stream: true }),
  });
  if (!upstream.ok || !upstream.body) throw new BosonError(upstream.status, await upstream.text());
  return upstream.body;
}

/** A Higgs TTS 3 request; Higgs Avatar takes the same body as its `input_tts`. */
function speechRequest(text: string, voice: string, emotion: string | undefined, lang: Language) {
  const tag = EMOTIONS.includes(emotion as never) ? `<|emotion:${emotion}|>` : "";
  // Naming the language makes numbers and units read reliably.
  return { model: "higgs-tts-3", input: tag + text, voice, language: LANGUAGES[lang].tts };
}

/** Fixed lines' audio, one file per voice, text and emotion, kept between server runs. */
const LINE_CACHE = new URL("../.cache/tts/", import.meta.url);

/**
 * The whole audio of a fixed line (raw PCM16 / 24 kHz / mono), synthesized once
 * per voice, text and emotion and then read from disk, so it costs TTS credit only once.
 */
export async function lineAudio(text: string, voice: string, emotion?: string, lang: Language = "en"): Promise<Buffer> {
  // Lines without an emotion keep the key they were cached under before emotions were added;
  // English lines keep theirs from before other languages were added.
  const base = emotion ? `${voice}\n${text}\n${emotion}` : `${voice}\n${text}`;
  const key = lang === "en" ? base : `${base}\n${lang}`;
  const file = new URL(`${createHash("sha256").update(key).digest("hex").slice(0, 32)}.pcm`, LINE_CACHE);
  try {
    return await readFile(file);
  } catch {
    // Not cached yet.
  }
  const chunks: Uint8Array[] = [];
  for await (const chunk of (await streamSpeech(text, voice, emotion, lang)) as AsyncIterable<Uint8Array>)
    chunks.push(chunk);
  const audio = Buffer.concat(chunks);
  await mkdir(LINE_CACHE, { recursive: true });
  await writeFile(file, audio);
  return audio;
}

// Higgs Avatar: talking-head video of the two TTS panelists (AVATAR=true). Adapted from
// Junwei's PR #4: the voice, language and portrait are now the interview's own.

/**
 * Landscape 4:3, the closest of Avatar's three sizes (640x640, 640x480, 480x640) to the
 * meeting tiles, which are about 1.5–2.2 times as wide as tall; the portraits are made
 * 4:3 to match (shared/settings.ts portraitFor). $0.07 a minute, like the others.
 */
const AVATAR_SIZE = "640x480";
/**
 * How often a job's status is checked. Two jobs polled every 0.5 s, plus the
 * line audio they need, hit Boson's rate limit (429 rate_limit_error) on 2026-10-23.
 */
const RENDER_POLL_MS = 1000;
const RENDER_TIMEOUT_MS = 120_000;
/** Avatar jobs rendered at once; Boson answers more with 429 all_replicas_busy. */
const RENDERS_AT_ONCE = 2;
/** Tries of a job turned down as busy or rate-limited (429), waiting Retry-After (else 5 s) in between. */
const RENDER_TRIES = 4;

/** How long Boson asks to wait after a 429 (Retry-After), else `fallback` ms. */
const retryAfterMs = (res: Response, fallback: number) => Number(res.headers.get("Retry-After")) * 1000 || fallback;

/**
 * Start a panelist's question as talking-head video: `portrait` (an image URL) speaks
 * `text` in `voice` and `lang`, lip-synced, with the voice synthesized inside the job.
 * Resolves with the fragmented-MP4 stream (voice included), whose frames arrive as
 * they are generated, and the video id.
 */
export async function streamAvatar(
  text: string,
  voice: string,
  emotion: string | undefined,
  lang: Language,
  portrait: string,
): Promise<{ id: string | null; body: ReadableStream<Uint8Array> }> {
  const upstream = await fetch(`${BOSON_BASE_URL}/v1/videos/stream`, {
    method: "POST",
    headers: bosonHeaders(),
    body: JSON.stringify(
      avatarRequest((await refImage(portrait)).ref, { input_tts: speechRequest(text, voice, emotion, lang) }),
    ),
  });
  if (!upstream.ok || !upstream.body) throw new BosonError(upstream.status, await upstream.text());
  return { id: upstream.headers.get("X-Video-Id"), body: upstream.body };
}

/** Fixed lines' videos, one file per voice, text, emotion, language, portrait and size, kept between server runs. */
const VIDEO_CACHE = new URL("../.cache/avatar/", import.meta.url);
/** Lines being rendered now, so a second request waits for the same job. */
const rendering = new Map<string, Promise<Buffer>>();

/**
 * How many of `lines` lineVideo has on disk already for this voice, language and portrait
 * (scripts/avatar-lines.ts --status, GET /api/avatar/ready).
 */
export async function videosCached(
  lines: Array<{ text: string; emotion?: string }>,
  voice: string,
  lang: Language,
  portrait: string,
): Promise<number> {
  const { hash } = await refImage(portrait);
  const found = await Promise.all(
    lines.map(({ text, emotion }) =>
      access(new URL(videoFileName(text, voice, emotion, lang, hash), VIDEO_CACHE)).then(
        () => true,
        () => false,
      ),
    ),
  );
  return found.filter(Boolean).length;
}

function videoFileName(text: string, voice: string, emotion: string | undefined, lang: Language, imageHash: string) {
  const key = `${voice}\n${text}\n${emotion ?? ""}\n${lang}\n${imageHash}\n${AVATAR_SIZE}`;
  return `${createHash("sha256").update(key).digest("hex").slice(0, 32)}.mp4`;
}

/**
 * A fixed line as talking-head video (MP4), rendered once and then read from disk.
 * It is driven by the line's own cached audio (lineAudio), so the video says exactly
 * what the voice-only line says. The first render takes 10–25 s. `file`: the cache
 * file's name, for the test logs.
 */
export async function lineVideo(
  text: string,
  voice: string,
  emotion: string | undefined,
  lang: Language,
  portrait: string,
): Promise<{ mp4: Buffer; cached: boolean; file: string }> {
  const image = await refImage(portrait);
  const name = videoFileName(text, voice, emotion, lang, image.hash);
  const file = new URL(name, VIDEO_CACHE);
  try {
    return { mp4: await readFile(file), cached: true, file: name };
  } catch {
    // Not rendered yet.
  }
  let job = rendering.get(file.href);
  if (!job) {
    job = (async () => {
      const audio = await lineAudio(text, voice, emotion, lang);
      const input = `data:audio/wav;base64,${wav(audio).toString("base64")}`;
      const mp4 = Buffer.from(await renderJob(avatarRequest(image.ref, { input })));
      await mkdir(VIDEO_CACHE, { recursive: true });
      await writeFile(file, mp4);
      return mp4;
    })().finally(() => rendering.delete(file.href));
    rendering.set(file.href, job);
  }
  return { mp4: await job, cached: false, file: name };
}

/** Length of a raw listening take (scripts/avatar-idle.ts): Avatar's longest input, for the most choice. */
export const IDLE_SECONDS = 60;

/**
 * Offline only (scripts/avatar-idle.ts, from Peize's feat/avatar-natural-transitions):
 * `portrait` listening in silence for IDLE_SECONDS, driven by silent audio instead of TTS.
 * Boson answers the very same request with the very same video, so `take` (1, 2, …) puts
 * that many inaudible 1-bit samples at the start to get a different one.
 * An interview only plays the saved file and never calls this.
 */
export async function renderIdleAvatar(portrait: string, take = 1): Promise<ArrayBuffer> {
  const { ref } = await refImage(portrait);
  const pcm = Buffer.alloc(24_000 * 2 * IDLE_SECONDS);
  for (let i = 0; i < take - 1; i++) pcm.writeInt16LE(1, i * 2);
  const silence = wav(pcm);
  return renderJob(avatarRequest(ref, { input: `data:audio/wav;base64,${silence.toString("base64")}` }), 300_000);
}

function avatarRequest(ref: string, drive: { input: string } | { input_tts: object }) {
  return { model: "higgs-avatar", ref_image: ref, size: AVATAR_SIZE, ...drive };
}

/** Our own photos (shared/settings.ts OWN_PORTRAITS), served to the browser by Vite. */
const PUBLIC_DIR = new URL("../public/", import.meta.url);

/**
 * A portrait as Avatar's ref_image: an http(s) URL as it is, or one of our own files
 * ("/portraits/…") inline as a data URI (as in Junwei's PR #4), plus what the video cache
 * keys on: the URL, or a hash of the file, so a replaced photo renders anew.
 */
async function refImage(portrait: string): Promise<{ ref: string; hash: string }> {
  if (/^https?:/.test(portrait)) return { ref: portrait, hash: portrait };
  const bytes = await readFile(new URL(portrait.replace(/^\//, ""), PUBLIC_DIR));
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
  const type = portrait.endsWith(".png") ? "image/png" : "image/jpeg";
  return { ref: `data:${type};base64,${bytes.toString("base64")}`, hash };
}

/** Raw PCM16 / 24 kHz / mono (the TTS line format) as a WAV file, which Avatar's audio input takes. */
function wav(pcm: Buffer): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(24000, 24);
  header.writeUInt32LE(24000 * 2, 28); // bytes per second
  header.writeUInt16LE(2, 32); // bytes per sample
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

let renders = 0;
const renderQueue: Array<() => void> = [];

/** One async Avatar job to the finished MP4: create, poll, download. A few run at once. */
async function renderJob(request: object, timeoutMs = RENDER_TIMEOUT_MS): Promise<ArrayBuffer> {
  while (renders >= RENDERS_AT_ONCE) await new Promise<void>((resolve) => renderQueue.push(resolve));
  renders += 1;
  try {
    let id = "";
    for (let attempt = 1; !id; attempt++) {
      const created = await fetch(`${BOSON_BASE_URL}/v1/videos`, {
        method: "POST",
        headers: bosonHeaders(),
        body: JSON.stringify(request),
      });
      const text = await created.text();
      if (created.ok) id = (JSON.parse(text) as { id: string }).id;
      // No credit left is a 429 too, but waiting does not help it.
      else if (created.status !== 429 || text.includes("insufficient_quota") || attempt >= RENDER_TRIES) {
        throw new BosonError(created.status, text);
      } else {
        await new Promise((resolve) => setTimeout(resolve, retryAfterMs(created, 5000)));
      }
    }
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const polled = await fetch(`${BOSON_BASE_URL}/v1/videos/${id}`, { headers: bosonHeaders() });
      const text = await polled.text();
      // The job keeps running while a status check is rate-limited; just check again later.
      if (polled.status === 429 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, retryAfterMs(polled, 2000)));
        continue;
      }
      if (!polled.ok) throw new BosonError(polled.status, text);
      const video = JSON.parse(text) as { status: string; error?: string | null };
      if (video.status === "completed") break;
      if (video.status === "failed") {
        throw new BosonError(502, `avatar video ${id} failed: ${video.error ?? "no reason given"}`);
      }
      if (Date.now() > deadline)
        throw new BosonError(504, `avatar video ${id} not ready after ${timeoutMs / 1000} s`);
      await new Promise((resolve) => setTimeout(resolve, RENDER_POLL_MS));
    }
    const content = await fetch(`${BOSON_BASE_URL}/v1/videos/${id}/content`, { headers: bosonHeaders() });
    if (!content.ok) throw new BosonError(content.status, await content.text());
    return await content.arrayBuffer();
  } finally {
    renders -= 1;
    renderQueue.shift()?.();
  }
}
