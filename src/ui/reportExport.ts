// Downloads of the post-interview report (src/ui/Report.tsx): Markdown built from
// the report's data, and a PDF made from a picture of the rendered report, so
// every language and chart comes out as it looks on screen. Both are saved by
// the browser into its downloads folder.

import type { Speaker } from "../../shared/panel";
import type { Person } from "../../shared/people";
import { BANDS, DIMENSIONS, STAR_PARTS, type Report } from "../../shared/report";
import type { Turn } from "../api";

/** "hotseat-report-2026-10-23-1742": dated by when the interview started (or now). */
export function reportFileName(startedAt: number | null, ext: "md" | "pdf"): string {
  const d = new Date(startedAt ?? Date.now());
  const pad = (n: number) => String(n).padStart(2, "0");
  return `hotseat-report-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.${ext}`;
}

function save(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const STAR_LABELS = { covered: "Covered", vague: "Vague", missing: "Missing", no_evidence: "Unverified" } as const;
const CLAIM_LABELS = {
  verified: "Verified",
  shallow: "Shallow",
  mismatch: "Mismatch",
  not_discussed: "Not discussed",
} as const;

/** The whole report as Markdown: the same sections as the page, then the transcript. */
export function reportMarkdown(
  report: Report,
  heading: string,
  people: Record<Speaker, Person>,
  turns: Turn[],
): string {
  const lines: string[] = [];
  const add = (...l: string[]) => lines.push(...l);
  const band = BANDS.find((b) => b.band === report.overall.band)?.label ?? "Not scored";

  add(`# ${report.project || "Interview report"}`, "", `_${heading}_`, "");
  add(`**Overall: ${report.overall.score ?? "—"} / 4 · ${band}**`, "", report.overall.summary, "");

  const d = report.delivery;
  const answered = report.rounds.filter((r) => !r.unanswered).length;
  add("| | |", "|---|---|", `| Questions answered | ${answered} / ${report.rounds.length} |`);
  if (d) {
    add(`| Speaking speed | ${d.wpm ?? "—"} wpm (target 120–160) |`);
    add(`| Your speaking time | ${(d.speakingMs / 60_000).toFixed(1)} min |`);
    if (d.panelMs !== null) add(`| Panel speaking time | ${(d.panelMs / 60_000).toFixed(1)} min |`);
    if (d.medianLatencyMs !== null) add(`| Time to first word | ${(d.medianLatencyMs / 1000).toFixed(1)} s (median) |`);
    add(`| Filler words | ${d.fillersPerMinute ?? d.fillers}${d.fillersPerMinute !== null ? " / min" : ""} |`);
  }
  if (report.claims) {
    const verified = report.claims.filter((c) => c.status === "verified").length;
    add(`| Résumé claims verified | ${verified} / ${report.claims.length} |`);
  }
  add("");

  if (report.star) {
    add("## Your opening (STAR, shown, not scored)", "");
    for (const s of report.star) {
      const part = STAR_PARTS.find((p) => p.part === s.part)!;
      add(
        `- **${part.letter} · ${part.label}: ${STAR_LABELS[s.status]}**${s.quote ? ` — “${s.quote}”` : ""}${s.note ? ` (${s.note})` : ""}`,
      );
    }
    add("");
  }

  add("## Skills", "", "| Skill | Score | Note |", "|---|---|---|");
  for (const dim of report.dimensions) {
    const label = DIMENSIONS.find((x) => x.id === dim.id)!.label;
    add(`| ${label} | ${dim.score ?? "—"} / 4 | ${(dim.headline || dim.comment).replace(/\|/g, "/")} |`);
  }
  add("");
  for (const dim of report.dimensions) {
    if (!dim.comment && dim.evidence.length === 0) continue;
    add(`### ${DIMENSIONS.find((x) => x.id === dim.id)!.label}`, "", dim.comment);
    for (const e of dim.evidence) add("", `> “${e.quote}”${e.note ? ` — ${e.note}` : ""}`);
    add("");
  }

  if (report.debrief.length) {
    add("## From the panel", "");
    for (const line of report.debrief) add(`- **${people[line.speaker].name}:** “${line.text}”`);
    add("");
  }

  if (report.practice.length) {
    add("## Practice next", "");
    report.practice.forEach((p, i) => {
      add(`### ${i + 1}. ${p.title}`, "");
      if (p.resumeLine) add(`Résumé: “${p.resumeLine}”`, "");
      add(p.issue, "");
      if (p.quote) add(`> “${p.quote}”`, "");
      if (p.haveReady.length) add("Have ready:", ...p.haveReady.map((f) => `- [ ] ${f}`), "");
      add(`Sample answer: ${p.trySaying}`, "");
      add(`${people[p.question.speaker].name} will likely ask: “${p.question.text}”`, "");
    });
  }
  if (report.otherProjects?.length) add(`Not asked yet, from your résumé: ${report.otherProjects.join(" · ")}`, "");

  add("## Rounds", "");
  for (const r of report.rounds) {
    add(
      `### ${r.round === 0 ? "Opening" : `Round ${r.round}`} · ${people[r.speaker].name}${r.difficulty ? ` · ${r.difficulty}` : ""}`,
      "",
    );
    add(`**Q:** ${r.question}`, "", r.unanswered ? "_Not answered_" : r.summary, "");
    if (r.wentWell) add(`- Went well: ${r.wentWell}`);
    if (r.improve) add(`- Improve: ${r.improve}`);
    if (r.betterOutline.length) add(`- A stronger answer would cover: ${r.betterOutline.join("; ")}`);
    add("");
  }

  if (report.claims?.length) {
    add("## Résumé check", "");
    for (const c of report.claims) {
      add(
        `- **${CLAIM_LABELS[c.status]}:** ${c.claim}${c.quote ? ` — “${c.quote}”` : ""}${c.note ? ` (${c.note})` : ""}`,
      );
    }
    add("");
  }

  if (turns.length) {
    add("## Transcript", "");
    for (const t of turns) add(`**${people[t.speaker].name}:** ${t.text}`, "");
  }
  add(`---`, `_Written by ${report.model} on ${new Date(report.createdAt).toLocaleString("en-US")}_`, "");
  return lines.join("\n");
}

export function downloadMarkdown(markdown: string, name: string): void {
  save(new Blob([markdown], { type: "text/markdown;charset=utf-8" }), name);
}

/**
 * A PDF of `node` as it is rendered (A4 pages, cut into page-high slices), on the
 * page's dark background. Fonts and charts come out exactly as on screen.
 */
export async function downloadPdf(node: HTMLElement, name: string): Promise<void> {
  const [{ toCanvas }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
  const background = getComputedStyle(document.body).backgroundColor || "#07090d";
  const canvas = await toCanvas(node, { pixelRatio: 2, backgroundColor: background, cacheBust: true });
  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 24;
  const contentW = pageW - margin * 2;
  const scale = contentW / canvas.width;
  const sliceH = Math.floor((pageH - margin * 2) / scale);
  const slice = document.createElement("canvas");
  slice.width = canvas.width;
  for (let y = 0, page = 0; y < canvas.height; y += sliceH, page++) {
    const h = Math.min(sliceH, canvas.height - y);
    slice.height = h;
    const c = slice.getContext("2d")!;
    c.fillStyle = background;
    c.fillRect(0, 0, slice.width, h);
    c.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
    if (page > 0) pdf.addPage();
    pdf.setFillColor(background);
    pdf.rect(0, 0, pageW, pageH, "F");
    pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", margin, margin, contentW, h * scale);
  }
  pdf.save(name);
}
