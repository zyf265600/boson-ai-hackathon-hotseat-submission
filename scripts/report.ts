// Build the post-interview report (doc/report-design.zh.md) for a saved test
// session, to tune the rubric and the judge's prompt before the report is wired
// into the app. Writes logs/<name>.report.json and prints a summary.
// Logs saved before the hub kept its events have no delivery metrics.
// Run from hotseat/: npm run report -- <logs/session.json | corpus/report-fixtures/x.json> [--resume corpus/sample-resume.txt] [--lang zh]
// --lang: the language the report is written in (a session's own settings language otherwise, else English).

import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { LABELS } from "../shared/panel";
import { isLanguage } from "../shared/languages";
import {
  BANDS,
  DIMENSIONS,
  STAR_PARTS,
  type Band,
  type ReportInput,
  type StarPart,
  type StarStatus,
} from "../shared/report";
import type { SessionRecord } from "../server/testLogs";
import { buildReport } from "../server/report";

const args = process.argv.slice(2);
const resumeAt = args.indexOf("--resume");
const resumePath = resumeAt >= 0 ? args.splice(resumeAt, 2)[1] : undefined;
const langAt = args.indexOf("--lang");
const lang = langAt >= 0 ? args.splice(langAt, 2)[1] : undefined;
if (lang !== undefined && !isLanguage(lang)) {
  console.error(`--lang ${lang}: not an interview language (en, zh, es, fr, de, ja, ko, pt)`);
  process.exit(1);
}
const logPath = args[0];
if (!logPath?.endsWith(".json")) {
  console.error(
    "Usage: npm run report -- <logs/session.json | corpus/report-fixtures/x.json> [--resume <resume.txt>] [--lang <code>]",
  );
  process.exit(1);
}

// A saved session (logs/), or a fixture already in the report's input shape
// (corpus/report-fixtures/), which also says which overall bands, and which
// STAR statuses for the opening, count as a pass.
type Fixture = ReportInput & { expectBands?: Band[]; expectStar?: Partial<Record<StarPart, StarStatus[]>> };
const file = JSON.parse(readFileSync(logPath, "utf8")) as (SessionRecord & Pick<ReportInput, "events">) | Fixture;
const fixture = "transcript" in file ? file : null;
const record = "memory" in file ? file : null;
const input: ReportInput = {
  transcript: fixture?.transcript ?? record!.memory.map(({ speaker, text }) => ({ speaker, text })),
  questions: file.questions,
  resume: resumePath ? readFileSync(resumePath, "utf8") : undefined,
  events: file.events,
  language: lang && isLanguage(lang) ? lang : record?.settings?.language,
};

const startedAt = performance.now();
const report = await buildReport(input);
const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);
// Reports go to logs/ (git-ignored), next to the session or named after the fixture.
const out = (fixture ? `logs/${basename(logPath)}` : logPath).replace(/\.json$/, ".report.json");
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);

const band = BANDS.find((b) => b.band === report.overall.band)?.label ?? "not scored";
console.log(`Report by ${report.model} in ${seconds} s → ${out}\n`);
console.log(`${report.project}\nOverall: ${band} (${report.overall.score ?? "—"}) · ${report.overall.summary}\n`);
for (const d of report.dimensions) {
  const label = DIMENSIONS.find((x) => x.id === d.id)!.label;
  console.log(`  ${label.padEnd(24)} ${d.score ?? "—"}  ${d.status === "scored" ? "" : `(${d.status}) `}${d.comment}`);
  for (const e of d.evidence) console.log(`      "${e.quote}" — ${e.note}`);
}
console.log("\nRounds:");
for (const r of report.rounds) {
  console.log(`  ${r.round}. [${LABELS[r.speaker]}${r.difficulty ? `, ${r.difficulty}` : ""}] ${r.question}`);
  console.log(`     ${r.unanswered ? "(no answer)" : r.summary}`);
  if (r.improve) console.log(`     Improve: ${r.improve}`);
}
console.log("\nPractice next:");
for (const [i, p] of report.practice.entries()) {
  const label = p.star
    ? `Opening, STAR ${p.star.map((part) => STAR_PARTS.find((x) => x.part === part)!.letter).join("")}`
    : DIMENSIONS.find((x) => x.id === p.dimension)!.label;
  console.log(`  ${i + 1}. ${p.title} [${label}${p.round === null ? "" : `, round ${p.round}`}]`);
  if (p.resumeLine) console.log(`     Resume: "${p.resumeLine}"`);
  console.log(`     ${p.issue}`);
  console.log(`     Have ready: ${p.haveReady.join(" · ")}`);
  console.log(`     Try saying: "${p.trySaying}"`);
  console.log(`     ${LABELS[p.question.speaker]} asks: "${p.question.text}"`);
}
if (report.claims) {
  console.log("\nResume check:");
  for (const c of report.claims) console.log(`  [${c.status}] ${c.claim}${c.note ? ` · ${c.note}` : ""}`);
  console.log(`  Not covered: ${report.otherProjects?.join(" · ") || "—"}`);
}
if (report.delivery) console.log("\nDelivery:", report.delivery);
console.log("\nDebrief:");
for (const d of report.debrief) console.log(`  ${LABELS[d.speaker]}: ${d.text}`);

if (report.star) {
  console.log("\nOpening STAR (shown, not scored):");
  for (const s of report.star) {
    const letter = STAR_PARTS.find((x) => x.part === s.part)!.letter;
    console.log(`  ${letter} ${s.status.padEnd(11)} ${s.quote ? `"${s.quote}" · ` : ""}${s.note}`);
  }
}

if (fixture?.expectBands) {
  const pass = report.overall.band !== null && fixture.expectBands.includes(report.overall.band);
  console.log(`\n${pass ? "PASS" : "FAIL"}: band ${report.overall.band}, expected ${fixture.expectBands.join(" or ")}`);
  if (!pass) process.exitCode = 1;
}
for (const [part, want] of Object.entries(fixture?.expectStar ?? {})) {
  const got = report.star?.find((s) => s.part === part)?.status ?? "none";
  const pass = want.includes(got as StarStatus);
  console.log(`${pass ? "PASS" : "FAIL"}: STAR ${part} ${got}, expected ${want.join(" or ")}`);
  if (!pass) process.exitCode = 1;
}
