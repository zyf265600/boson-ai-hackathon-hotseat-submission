// AVATAR=true: render the on-camera fixed lines' videos ahead into the server's disk cache
// (.cache/avatar/), so an interview loads them in a few seconds on the waiting screen
// instead of rendering each (10–25 s) the first time. The same as the fixed lines' audio,
// which is synthesized once and kept (.cache/tts/). A voice can sit in either TTS seat, so
// each voice gets both seats' lines (26 per language: silence prompts, the wrap-up and every
// difficulty's backup questions). Lines already rendered are skipped (the cache is keyed on
// the photo's bytes too, so only a new or replaced photo renders again), so it can be run
// again after a stop. Needs BOSON_API_KEY in .env; about $0.07 per minute of video, about
// 2 minutes per voice and language. Run from hotseat/:
//   npm run avatar:lines -- --portraits --lang en,zh     every photo in public/portraits/
//   npm run avatar:lines -- --recommended --lang en,zh     the 20 voices listed first (RECOMMENDED_VOICES)
//   npm run avatar:lines -- --voices educational-v08,nerd-v06 [--lang en]
//   add --status to only count what is rendered, per voice and language
// A voice: a catalog id (doc/interviewer-voices.zh.md) or its voice_… name; --lang defaults to all 8.
// A photo is public/portraits/<catalog id>.jpg or .png; --portraits also brings the list the
// app reads (shared/portraits.json) up to date with the folder.
// Adapted from Junwei's PR #4.

import "dotenv/config";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { lineVideo, videosCached } from "../server/boson";
import { LANGUAGES, isLanguage, type Language } from "../shared/languages";
import { RECOMMENDED_VOICES, VOICE_CATALOG, portraitFor, type CatalogVoice } from "../shared/settings";
import type { Panelist } from "../shared/panel";
import { videoLines } from "../corpus/avatar-lines";

/** Lines worked on at once: the server renders 2 at a time; a third synthesizes its audio meanwhile. */
const WORKERS = 3;

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

// Our own photos, by catalog id. Read from the folder here: shared/portraits.json, which
// portraitFor reads, may be the one this run brings up to date.
const PORTRAITS = new URL("../public/portraits/", import.meta.url);
const LIST = new URL("../shared/portraits.json", import.meta.url);
const files = (await readdir(PORTRAITS)).filter((f) => !f.startsWith(".")).sort();
const photos = new Map<string, string>();
for (const f of files) {
  const id = f.replace(/\.(jpe?g|png)$/i, "");
  if (id === f || !VOICE_CATALOG.some((v) => v.id === id)) {
    console.error(`public/portraits/${f}: not <catalog id>.jpg or .png, skipped`);
    continue;
  }
  photos.set(id, `/portraits/${f}`);
}
const portrait = (v: CatalogVoice) => photos.get(v.id) ?? portraitFor(v.voice)!;

const status = process.argv.includes("--status");
if (process.argv.includes("--portraits") && !status) {
  const before = JSON.parse(await readFile(LIST, "utf8")) as string[];
  const now = [...photos.values()].map((p) => p.slice("/portraits/".length));
  const added = now.filter((f) => !before.includes(f));
  const removed = before.filter((f) => !now.includes(f));
  if (added.length || removed.length) {
    await writeFile(LIST, `${JSON.stringify(now, null, 2)}\n`);
    console.log(
      `shared/portraits.json: ${added.length} added (${added.join(", ")}), ${removed.length} removed (${removed.join(", ")})`,
    );
  }
}

const given = process.argv.includes("--portraits")
  ? [...photos.keys()]
  : process.argv.includes("--recommended")
    ? RECOMMENDED_VOICES
    : (arg("voices")?.split(",") ?? []);
const voices = given.map((id) => {
  const voice = VOICE_CATALOG.find((v) => v.id === id || v.voice === id);
  if (!voice) {
    console.error(`"${id}" is not a catalog voice (preset voices have no portrait)`);
    process.exit(1);
  }
  return voice;
});
if (voices.length === 0) {
  console.error("Name the voices: --portraits, --recommended, or --voices <id>,<id>");
  process.exit(1);
}
const langs = (arg("lang")?.split(",") ?? Object.keys(LANGUAGES)).filter((l): l is Language => {
  if (isLanguage(l)) return true;
  console.error(`--lang: unknown language "${l}", skipped`);
  return false;
});

const SEATS: Panelist[] = ["technical_lead", "mentor"];
// Voice by voice, so a stop leaves whole voices done.
const jobs = voices.flatMap((v) =>
  langs.flatMap((lang) => SEATS.flatMap((seat) => videoLines(lang, seat).map((line) => ({ v, lang, seat, ...line })))),
);

if (status) {
  // Per voice and language: lines on disk / lines in all.
  console.log(`voice${" ".repeat(19)}photo  ${langs.map((l) => l.padEnd(6)).join("")}`);
  for (const v of voices) {
    const counts = await Promise.all(
      langs.map(async (lang) => {
        const own = jobs.filter((j) => j.v === v && j.lang === lang);
        return `${await videosCached(own, v.voice, lang, portrait(v))}/${own.length}`.padEnd(6);
      }),
    );
    console.log(`${v.id.padEnd(24)}${(photos.has(v.id) ? "own" : "—").padEnd(7)}${counts.join("")}`);
  }
  process.exit(0);
}
console.log(`${voices.length} voices × ${langs.join(", ")}: ${jobs.length} lines`);

const startedAt = performance.now();
let finished = 0;
let rendered = 0;
let failed = 0;
const queue = [...jobs];
await Promise.all(
  Array.from({ length: WORKERS }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const { v, lang, seat, text, emotion } = job;
      try {
        const { cached } = await lineVideo(text, v.voice, emotion, lang, portrait(v));
        if (!cached) {
          rendered += 1;
          console.log(`  [${finished + 1}/${jobs.length}] rendered ${v.id} ${lang} ${seat}: "${text}"`);
        }
      } catch (err) {
        failed += 1;
        console.log(`  FAILED ${v.id} ${lang} ${seat}: "${text}" (${(err as Error).message.slice(0, 200)})`);
      }
      finished += 1;
    }
  }),
);
const minutes = ((performance.now() - startedAt) / 60000).toFixed(1);
console.log(
  `Done in ${minutes} min: ${rendered} rendered, ${jobs.length - rendered - failed} already cached, ${failed} failed`,
);
