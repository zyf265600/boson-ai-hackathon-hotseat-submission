// The sample answers in corpus/candidate-scripts/, bundled at build time. File names are
// <project>.<length>.txt, e.g. vividseats-search-cache.1min.txt.

const FILES = import.meta.glob("../../corpus/candidate-scripts/*.txt", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export type ScriptLength = "30s" | "1min" | "2min";

export const SCRIPT_LENGTHS: { id: ScriptLength; label: string }[] = [
  { id: "30s", label: "30 s" },
  { id: "1min", label: "1 min" },
  { id: "2min", label: "2 min" },
];

export const PROJECTS: { id: string; title: string }[] = [
  { id: "canary-rag-poisoning", title: "Canary functions · RAG poisoning" },
  { id: "vividseats-search-cache", title: "VividSeats · search cache" },
  { id: "checker-framework-nullness", title: "Checker Framework · Nullness" },
];

/** The script as paragraphs; each one is a separate TTS request (Boson suggests ≤300 chars). */
export function scriptParagraphs(project: string, length: ScriptLength): string[] {
  const text = FILES[`../../corpus/candidate-scripts/${project}.${length}.txt`] ?? "";
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}
