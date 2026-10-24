// Each interviewer photo's silent listening loop (after Peize's idle loops in
// feat/avatar-natural-transitions, for all our photos), in two steps:
// 1. Render: Higgs Avatar driven by IDLE_SECONDS of silence, kept as .cache/idle/<catalog id>.mp4
//    with a .json stamp holding the photo's hash, so an unchanged photo is not rendered
//    again. Uses Boson credits: $0.07 per minute of video, so $0.07 a take. A photo whose
//    takes have no teeth-free stretch of HALF_S gets another take, up to MAX_TAKES.
// 2. Cut (no API call): one continuous HALF_S stretch of that take, played forward and then
//    backward, so the loop never splices different moments (10/23, user: splicing stretches
//    with dissolves made the head jerk like a nod). The stretch has no teeth anywhere (the
//    avatar breaks into open smiles now and then; the user wants closed-mouth smiles only)
//    and the least head motion; it also turns around where the head is nearly still.
//    scripts/idle-mouth.swift finds teeth and the face box frame by frame with macOS Vision.
//    Saved as public/idle/<catalog id>.mp4 (no sound, about 2 × HALF_S) with a .json of the
//    stretch used. Needs macOS (swiftc) and ffmpeg.
// An interview only plays public/idle/. Run from hotseat/:
//   npm run avatar:idle [-- --only nerd-v06,banker-v01] [--trim-only]

import "dotenv/config";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { IDLE_SECONDS, renderIdleAvatar } from "../server/boson";
import ownPortraits from "../shared/portraits.json";

const run = promisify(execFile);
const RAW = new URL("../.cache/idle/", import.meta.url);
const OUT = new URL("../public/idle/", import.meta.url);
const MOUTH_SOURCE = new URL("./idle-mouth.swift", import.meta.url);
const MOUTH_TOOL = new URL("idle-mouth", RAW);
const FPS = 24;
/** Teeth score (idle-mouth.swift) from which a frame counts as showing teeth; checked by eye on 10/23. */
const TEETH = 0.3;
/**
 * Inner-lip opening (idle-mouth.swift `gap`) from which a frame counts as an open mouth even
 * without teeth (parted lips, as if about to speak); closed lips measure about 0–0.01.
 */
const LIP_GAP = 0.02;
/** Frames dropped on each side of a frame with teeth, so a smile's start and end go too. */
const MARGIN_FRAMES = 3;
/** The stretch played forward then backward: a loop of about twice this (user: 30 s). */
const HALF_S = 15;
/** Without a teeth-free stretch of HALF_S, the longest one is used, if at least this long. */
const MIN_HALF_S = 5;
/** Frames at each end of the stretch where the head should be nearly still (the turnaround). */
const END_FRAMES = 12;
/** Weight of head motion at the turnaround against motion over the whole stretch. */
const END_WEIGHT = 20;
/** Takes rendered at most per photo while none has a teeth-free stretch of HALF_S. */
const MAX_TAKES = 8;

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const only = arg("only") ? new Set(arg("only")!.split(",")) : null;
const trimOnly = process.argv.includes("--trim-only");
const path = (url: URL) => fileURLToPath(url);
const exists = (url: URL) =>
  stat(url).then(
    () => true,
    () => false,
  );

const photos = (ownPortraits as string[])
  .map((file) => ({ id: file.replace(/\.\w+$/, ""), portrait: `/portraits/${file}` }))
  .filter((p) => !only || only.has(p.id));
await mkdir(RAW, { recursive: true });
await mkdir(OUT, { recursive: true });

/** Take `n` of a photo in .cache/idle/: <id>.mp4 for the first, <id>.take<n>.mp4 after. */
const takeFile = (id: string, n: number) => new URL(n === 1 ? `${id}.mp4` : `${id}.take${n}.mp4`, RAW);

/** The photo's takes already rendered from its current bytes, by number. */
async function takesOf(id: string, sourceHash: string): Promise<number[]> {
  const found: number[] = [];
  for (let n = 1; n <= MAX_TAKES; n++) {
    try {
      const stamp = JSON.parse(await readFile(new URL(`${takeFile(id, n).href}.json`), "utf8")) as {
        sourceHash: string;
        seconds: number;
      };
      if (stamp.sourceHash === sourceHash && stamp.seconds === IDLE_SECONDS && (await exists(takeFile(id, n)))) {
        found.push(n);
      }
    } catch {
      /* Not rendered, or from an earlier photo. */
    }
  }
  return found;
}

/** Step 1: render take `n` of a photo. */
async function render(id: string, portrait: string, sourceHash: string, n: number): Promise<void> {
  if (trimOnly) throw new Error("no raw take in .cache/idle/ (run without --trim-only)");
  const started = Date.now();
  const mp4 = await renderIdleAvatar(portrait, n);
  await writeFile(takeFile(id, n), Buffer.from(mp4));
  const meta = {
    sourceHash,
    portrait,
    model: "higgs-avatar",
    seconds: IDLE_SECONDS,
    drive: "silent PCM",
    size: "640x480",
  };
  await writeFile(
    new URL(`${takeFile(id, n).href}.json`),
    `${JSON.stringify({ ...meta, createdAt: new Date().toISOString() }, null, 2)}\n`,
  );
  console.log(`${id}: take ${n} rendered in ${((Date.now() - started) / 1000).toFixed(0)} s`);
}

interface Frame {
  gap: number;
  teeth: number;
  x: number;
  y: number;
  size: number;
}

/** A raw take measured frame by frame (idle-mouth.swift). */
async function measure(take: URL): Promise<Frame[]> {
  const { stdout } = await run(path(MOUTH_TOOL), [path(take)], { maxBuffer: 32 << 20 });
  return stdout
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => {
      const c = line.split(",").map(Number);
      return { gap: c[2], teeth: c[6], x: c[7], y: c[8], size: c[9] };
    });
}

/**
 * A take's best stretch [start, end) in frames: no teeth (nor a lost face) anywhere in it, of
 * HALF_S (else the longest such), with the least head motion counting its ends END_WEIGHT
 * times. Null without one of MIN_HALF_S.
 */
function pickStretch(frames: Frame[]): { stretch: [number, number]; score: number } | null {
  const n = frames.length;
  const ok = frames.map(() => true);
  frames.forEach((f, i) => {
    if (f.teeth < 0 || f.teeth >= TEETH || f.gap >= LIP_GAP) {
      for (let j = Math.max(0, i - MARGIN_FRAMES); j <= Math.min(n - 1, i + MARGIN_FRAMES); j++) ok[j] = false;
    }
  });
  // Head motion into each frame: how far the face box moved and grew, smoothed over 5 frames
  // against Vision's jitter.
  const raw = frames.map((f, i) =>
    i === 0 || !ok[i] || !ok[i - 1]
      ? 0
      : Math.hypot(f.x - frames[i - 1].x, f.y - frames[i - 1].y, f.size - frames[i - 1].size),
  );
  const motion = raw.map((_, i) => {
    const near = raw.slice(Math.max(0, i - 2), i + 3);
    return near.reduce((a, b) => a + b, 0) / near.length;
  });
  const sum = [0];
  motion.forEach((m, i) => sum.push(sum[i] + m));
  const between = (a: number, b: number) => sum[b] - sum[a];
  // The longest run of good frames bounds the stretch.
  let longest = 0;
  for (let i = 0, run = 0; i < n; i++) longest = Math.max(longest, (run = ok[i] ? run + 1 : 0));
  const length = Math.min(HALF_S * FPS, longest);
  if (length < MIN_HALF_S * FPS) return null;
  let best: [number, number] | null = null;
  let bestScore = Infinity;
  for (let a = 0, bad = 0; a + length <= n; a++) {
    if (a === 0) for (let i = 0; i < length; i++) bad += ok[i] ? 0 : 1;
    else bad += (ok[a + length - 1] ? 0 : 1) - (ok[a - 1] ? 0 : 1);
    if (bad > 0) continue;
    const b = a + length;
    const score = between(a, b) + END_WEIGHT * (between(a, a + END_FRAMES) + between(b - END_FRAMES, b));
    if (score < bestScore) [best, bestScore] = [[a, b], score];
  }
  return { stretch: best!, score: bestScore };
}

/** Step 2: frames [a, b) of `take` forward then backward, as one seamless loop; its length in seconds. */
async function cut(id: string, take: URL, [a, b]: [number, number]): Promise<number> {
  const frames = b - a;
  // Backward without its first and last frames, which the forward half already shows at
  // its end and (on the next loop) its start, so no frame is held twice.
  const graph = [
    `[0:v]trim=start_frame=${a}:end_frame=${b},setpts=PTS-STARTPTS,split[f][r]`,
    `[r]reverse,trim=start_frame=1:end_frame=${frames - 1},setpts=PTS-STARTPTS[back]`,
    `[f][back]concat=n=2:v=1:a=0,format=yuv420p[out]`,
  ];
  await run("ffmpeg", [
    ...["-v", "error", "-y", "-i", path(take), "-filter_complex", graph.join(";")],
    ...["-map", "[out]", "-an", "-r", String(FPS), "-c:v", "libx264", "-crf", "22", "-preset", "slow"],
    ...["-movflags", "+faststart", path(new URL(`${id}.mp4`, OUT))],
  ]);
  return Math.round(((2 * frames - 2) / FPS) * 1000) / 1000;
}

// The Vision tool, compiled once (again when its source is newer).
if (!(await exists(MOUTH_TOOL)) || (await stat(MOUTH_SOURCE)).mtimeMs > (await stat(MOUTH_TOOL)).mtimeMs) {
  await run("swiftc", ["-O", path(MOUTH_SOURCE), "-o", path(MOUTH_TOOL)]);
}

let rendered = 0;
const failed: string[] = [];
// renderJob already runs 2 at a time; the rest wait in its queue.
await Promise.all(
  photos.map(async ({ id, portrait }) => {
    try {
      const sourceHash = createHash("sha256")
        .update(await readFile(new URL(`../public${portrait}`, import.meta.url)))
        .digest("hex");
      const takes = await takesOf(id, sourceHash);
      // The best stretch over all takes: the longest, then the stillest.
      let best: { take: number; stretch: [number, number]; score: number } | null = null;
      const consider = async (take: number) => {
        const pick = pickStretch(await measure(takeFile(id, take)));
        if (!pick) return;
        const length = (p: { stretch: [number, number] }) => p.stretch[1] - p.stretch[0];
        if (!best || length(pick) > length(best) || (length(pick) === length(best) && pick.score < best.score)) {
          best = { take, ...pick };
        }
      };
      for (const take of takes) await consider(take);
      const full = () => best !== null && best.stretch[1] - best.stretch[0] >= HALF_S * FPS;
      for (let n = 1; !full() && !trimOnly && n <= MAX_TAKES; n++) {
        if (takes.includes(n)) continue;
        await render(id, portrait, sourceHash, n);
        rendered += 1;
        takes.push(n);
        await consider(n);
      }
      const chosen = best as { take: number; stretch: [number, number] } | null;
      if (!chosen) throw new Error(`no closed-mouth stretch of ${MIN_HALF_S} s in ${takes.length} take(s)`);
      const seconds = await cut(id, takeFile(id, chosen.take), chosen.stretch);
      const from = chosen.stretch.map((f) => Math.round((f / FPS) * 1000) / 1000);
      const meta = {
        sourceHash,
        seconds,
        take: chosen.take,
        stretch: from,
        rule: `one stretch of one take, forward then backward; mouth closed (teeth < ${TEETH}, lip gap < ${LIP_GAP}, ±${MARGIN_FRAMES} frames); least head motion`,
      };
      await writeFile(new URL(`${id}.mp4.json`, OUT), `${JSON.stringify(meta, null, 2)}\n`);
      console.log(
        `${id}: ${seconds.toFixed(1)} s loop from ${from[0]}–${from[1]} s of take ${chosen.take} of ${takes.length}`,
      );
    } catch (err) {
      failed.push(id);
      console.error(`${id}: failed: ${(err as Error).message}`);
    }
  }),
);
console.log(
  `${photos.length - failed.length} loops, ${rendered} takes newly rendered, ${failed.length} failed${failed.length ? ` (${failed.join(", ")})` : ""}`,
);
if (failed.length) process.exitCode = 1;
