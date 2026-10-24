// Builds the post-interview report (doc/report-design.zh.md): one JSON call to
// the Orchestrator's LLM judges the content against the rubric in
// shared/report.ts; the code splits the rounds, checks every quote against the
// transcript and every resume line against the resume, and computes the
// overall score and the delivery metrics. The opening's STAR coverage is
// shown on the report but never scored. The report is written in the
// interview's language; the candidate's quotes stay as they said them.

import { LANGUAGES, type Language } from "../shared/languages";
import { LABELS, roundPlan, type Panelist, type Speaker } from "../shared/panel";
import {
  DIMENSIONS,
  STAR_PARTS,
  bandOf,
  overallScore,
  type ClaimCheck,
  type ClaimStatus,
  type DimensionId,
  type DimensionScore,
  type Evidence,
  type PracticeDrill,
  type Report,
  type ReportInput,
  type RoundCard,
  type StarCheck,
  type StarPart,
  type StarStatus,
} from "../shared/report";
import { NO_ANSWER, deliveryMetrics } from "../shared/reportMetrics";
import { chatJson, providerName } from "./llm";

/** One question and everything the candidate said before the next one. */
interface Segment {
  round: number;
  speaker: Speaker;
  difficulty: string | null;
  question: string;
  answer: string;
  unanswered: boolean;
  /** The Orchestrator's live judgment of this answer, made while writing the next question. */
  judged?: { assessment: string; reason?: string };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const INTERRUPTED = " [interrupted]";

/** Whether a logged line is the question `question` (normalized): all of it, or the part heard before the candidate cut in. */
function askedAs(line: string, question: string): boolean {
  if (!line.endsWith(INTERRUPTED)) return norm(line) === question;
  const heard = norm(line.slice(0, -INTERRUPTED.length));
  return heard.length > 0 && question.startsWith(heard);
}

/**
 * Round 0 is the moderator's opening question (the first moderator turn); each
 * follow-up is found by its text after the previous one, since the transcript
 * also holds handoffs, silence prompts and repeats.
 */
export function segmentRounds(input: ReportInput): Segment[] {
  const { transcript } = input;
  const starts: { at: number; round: number; speaker: Speaker; difficulty: string | null; question: string }[] = [];
  const opening = transcript.findIndex((t) => t.speaker === "moderator");
  if (opening >= 0) {
    starts.push({ at: opening, round: 0, speaker: "moderator", difficulty: null, question: transcript[opening].text });
  }
  let cursor = Math.max(opening, 0);
  const asked = [...input.questions].filter((q) => q.result).sort((a, b) => a.round - b.round);
  for (const q of asked) {
    if (starts.some((s) => s.round === q.round)) continue;
    const text = norm(q.result!.question);
    const at = transcript.findIndex((t, i) => i > cursor && t.speaker === q.speaker && askedAs(t.text, text));
    if (at < 0) continue; // Prepared but never asked (the interview ended, or it was dropped).
    starts.push({ at, round: q.round, speaker: q.speaker, difficulty: q.difficulty, question: transcript[at].text });
    cursor = at;
  }

  return starts.map((s, i) => {
    const end = starts[i + 1]?.at ?? transcript.length;
    const said = transcript.slice(s.at + 1, end).filter((t) => t.speaker === "candidate");
    const real = said.filter((t) => t.text !== NO_ANSWER);
    // The next round's call judged this answer; the introduction is never judged.
    const next = input.questions.find((q) => q.round === s.round + 1 && q.result?.assessment);
    return {
      ...s,
      answer: real.map((t) => t.text).join("\n"),
      unanswered: real.length === 0,
      ...(next && s.round > 0 ? { judged: { assessment: next.result!.assessment!, reason: next.result!.reason } } : {}),
    };
  });
}

/** The language's name as the judge is told to write in it. */
const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  zh: "Simplified Chinese",
  es: "Latin American Spanish",
  fr: "French",
  de: "German",
  ja: "Japanese",
  ko: "Korean",
  pt: "Brazilian Portuguese",
};

/** What a number nobody stated becomes in a practice drill, in the report's language. */
const YOUR_NUMBER: Record<Language, string> = {
  en: "[your number]",
  zh: "[你的数字]",
  es: "[tu número]",
  fr: "[votre chiffre]",
  de: "[deine Zahl]",
  ja: "[あなたの数値]",
  ko: "[당신의 수치]",
  pt: "[seu número]",
};

const systemPrompt = (
  lang: Language,
) => `You assess a candidate's mock technical interview and write their practice report.
The candidate described one project they built; a moderator, a technical lead and a mentor asked about it.
Score only what the candidate said in this interview. The resume, if given, is a list of claims to check; it is never evidence of skill by itself.
The candidate's words come from speech recognition: ignore grammar and recognition mistakes, and judge only the content.
Do not judge pace, pauses or filler words; they are measured separately.
Score each dimension 1-4 by its anchors; pick the highest level whose description fully fits.
- A dimension is "not_probed" (score null) only if no question gave the candidate a chance to show it.
- A round with no answer counts as a 1 for the dimension that round probes, unless another answer shows it.
- Do not raise or lower a score for the round's difficulty.
- Every scored dimension needs 1-2 quotes: short (under 25 words), copied exactly, word for word, from the candidate's answers.
Write every text field for the candidate in ${LANGUAGE_NAMES[lang]}, as "you": specific, kind and honest; name what to change, not just what was weak.
Quotes and resume lines are the exception: copy them exactly as said or written, in the language they are in, never translated.
Keep the json keys and the listed values (ids, statuses, speakers) in English, exactly as shown.
Never invent facts the candidate did not state: no numbers, results, causes, limits, failure cases or correlations of your own.
Where a stronger answer needs one, write a placeholder in ${LANGUAGE_NAMES[lang]} that names what goes there, such as [your baseline], [the error rate you measured] or [a case where your method fails].
Reply in json.`;

const REPLY_SHAPE = `{
  "project": "<a short name for the project they talked about, under 8 words>",
  "summary": "<one sentence on the whole interview>",
  "dimensions": [{"id": "depth" | "tradeoffs" | "results" | "ownership" | "communication", "status": "scored" | "not_probed", "score": 1 | 2 | 3 | 4 | null, "evidence": [{"quote": "<exact words>", "note": "<what it shows>"}], "comment": "<one or two sentences>", "headline": "<the comment in under 7 words>"}],
  "rounds": [{"round": <number>, "summary": "<their answer in one sentence>", "went_well": "...", "improve": "...", "better_outline": ["<3-4 points a stronger answer would cover>"]}],
  "practice": [{"title": "<an instruction under 8 words>", "dimension": "<a dimension id>", "round": <the round it comes from, or null>, "resume_line": "<the resume words it rests on, copied exactly, or empty>", "issue": "<what happened, in one sentence>", "quote": "<exact words, or empty>", "have_ready": ["<2-3 facts to prepare, each under 8 words>"], "try_saying": "<a stronger answer, at most two sentences>", "question": {"asked_by": "technical_lead" | "mentor" | "moderator", "text": "<a follow-up under 25 words>"}, "star": [<"situation" and/or "task", only for the opening drill; otherwise empty>]}],
  "claims": [{"claim": "<one resume claim>", "status": "verified" | "shallow" | "mismatch" | "not_discussed", "quote": "<exact words, or empty>", "note": "..."}],
  "other_projects": ["<a project or job on the resume that the interview did not cover, under 6 words>"],
  "star": {"situation" | "task" | "action" | "result": {"status": "covered" | "vague" | "missing", "quote": "<exact words from the Round 0 answer, or empty>", "note": "<under 15 words>"}},
  "debrief": {"technical_lead": "...", "mentor": "...", "moderator": "..."},
  "debrief_headlines": {"technical_lead": "<under 7 words>", "mentor": "<under 7 words>", "moderator": "<under 7 words>"}
}`;

function rubric(): string {
  return DIMENSIONS.map(
    (d) => `- ${d.id} (${d.label}); look at: ${d.focus}\n` + d.anchors.map((a, i) => `  ${i + 1}: ${a}`).join("\n"),
  ).join("\n");
}

/** What a follow-up asks for: the Technical Lead alternates a deep dive and a challenge, the Mentor follows up (shared/panel.ts ASKERS). */
function roundKind(round: number): string {
  if (round === 0) return "opening";
  const { speaker, turn } = roundPlan(round);
  return speaker === "mentor" ? "follow-up" : turn % 2 === 0 ? "deep dive" : "challenge";
}

function roundHeading(s: Segment): string {
  const what = roundKind(s.round);
  return [`### Round ${s.round} · ${what}`, s.difficulty, `asked by the ${LABELS[s.speaker]}`]
    .filter(Boolean)
    .join(" · ");
}

function userPrompt(segments: Segment[], resume: string | undefined): string {
  const rounds = segments.map((s) =>
    [
      roundHeading(s),
      `Question: ${s.question}`,
      `Candidate: ${s.unanswered ? NO_ANSWER : s.answer}`,
      ...(s.judged
        ? [
            `Live judgment while the interview ran: ${s.judged.assessment}${s.judged.reason ? ` (${s.judged.reason})` : ""}`,
          ]
        : []),
    ].join("\n"),
  );
  return [
    "Rubric:",
    rubric(),
    "",
    "The interview, round by round:",
    rounds.join("\n\n"),
    "",
    resume?.trim()
      ? [
          "Resume (plain text). List its claims about the project the candidate talked about (its role, methods and results), at most 8,",
          "skipping every other project and job on it, and check each:",
          '"verified": they explained it with detail; "shallow": they mentioned it but could not back it up when asked;',
          '"mismatch": a number or fact differs from what they said (note: "resume: ... / interview: ..."); "not_discussed": never came up.',
          "other_projects: the other projects and jobs on the resume, each as a short name, so they can pick one next time.",
          "",
          resume.trim(),
        ].join("\n")
      : 'No resume was given: reply with "claims": [] and "other_projects": [], and leave every resume_line empty.',
    "",
    "Give one rounds entry per round above.",
    "practice: the 3 things most worth practicing before the next interview, most important first. Each is about this project, never generic advice:",
    "- resume_line: the resume words the drill rests on, a phrase copied exactly from the resume with no ellipsis; empty if none.",
    "- issue: what happened in this interview, naming the round, number or claim involved.",
    "- have_ready: the facts about this project to prepare. Put [brackets] around every number or detail they did not state; never fill one in.",
    "- try_saying: built only from what they said and the resume; every other number, limit or cause is a [placeholder].",
    "- question: what the technical_lead (depth, trade-offs) or the mentor (results, ownership) would likely ask about it next time.",
    '- If star below marks the situation or the task missing, add one more drill for it, a 4th: "star" lists what it fixes, round 0, asked_by the moderator,',
    "  still about this project (who had the problem, what they set out to do). Every other drill has an empty star.",
    "star: how the Round 0 answer alone covers STAR. It is shown to the candidate but never scored, so it must not change any dimension score.",
    ...STAR_PARTS.map((p) => `- ${p.part}: ${p.meaning}.`),
    '"covered": stated clearly; "vague": only hinted at, or too general to picture; "missing": not there.',
    "Naming only where the work sat (a company, team, system or technology) is not a situation: unless they say what was wrong or needed, it is missing.",
    "For covered and vague, quote the Round 0 words that show it, copied exactly; for missing, leave the quote empty.",
    "debrief: what each interviewer says aloud to the candidate as the report opens, one or two spoken sentences each, under 220 characters,",
    "no scores, numbers or lists: the technical_lead on depth and trade-offs, the mentor on results and one next step, the moderator closes with the overall impression.",
    'debrief_headlines: the gist of each debrief line in under 7 words, e.g. "Open with the problem next time".',
    'headline (each dimension): its comment in under 7 words, e.g. "Three options, their costs, a clear pick".',
    "",
    "Reply in this json shape:",
    REPLY_SHAPE,
  ].join("\n");
}

interface Reply {
  summary: string;
  dimensions: {
    id: string;
    status: string;
    score: unknown;
    evidence: { quote: string; note: string }[];
    comment: string;
    headline: string;
  }[];
  rounds: { round: number; summary: string; went_well: string; improve: string; better_outline: string[] }[];
  project: string;
  practice: {
    title: string;
    dimension: string;
    star: unknown;
    round: unknown;
    resume_line: string;
    issue: string;
    quote: string;
    have_ready: string[];
    try_saying: string;
    question: { asked_by: string; text: string };
  }[];
  claims: { claim: string; status: string; quote: string; note: string }[];
  other_projects: string[];
  star: Partial<Record<StarPart, { status: string; quote: string; note: string }>>;
  debrief: Partial<Record<Panelist | "moderator", string>>;
  debrief_headlines: Partial<Record<Panelist | "moderator", string>>;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const CLAIM_STATUSES: ClaimStatus[] = ["verified", "shallow", "mismatch", "not_discussed"];
const PANELISTS: Panelist[] = ["technical_lead", "mentor"];

/**
 * Is the phrase in the text, word for word (ignoring case and punctuation)? For a
 * language written without spaces (Chinese, Japanese) the spaces are dropped and
 * any run of characters counts, since there are no word edges to match.
 */
function phraseChecker(text: string, lang: Language): (phrase: string) => boolean {
  if (LANGUAGES[lang].countChars) {
    const all = norm(text).replace(/ /g, "");
    return (phrase) => {
      const p = norm(phrase).replace(/ /g, "");
      return p.length > 0 && all.includes(p);
    };
  }
  const all = ` ${norm(text)} `;
  return (phrase) => {
    const p = norm(phrase);
    return p.length > 0 && all.includes(` ${p} `);
  };
}

/** A number written in digits, not part of a name such as p99 or v2. */
const NUMBER = /(?<![\p{L}\p{N}.,])\d+(?:[.,]\d+)*/gu;
const UNITS: Record<string, number> = Object.fromEntries([
  ..."zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen"
    .split(" ")
    .map((w, i) => [w, i]),
  ..."twenty thirty forty fifty sixty seventy eighty ninety".split(" ").map((w, i) => [w, (i + 2) * 10]),
]);
const SCALES: Record<string, number> = { hundred: 100, thousand: 1_000, million: 1_000_000 };

/** Every number in the text, in digits: those written in digits, and spelled-out ones such as "a hundred and twenty". */
function numbersIn(text: string): Set<string> {
  const found = new Set([...text.matchAll(NUMBER)].map((m) => m[0].replace(/,/g, "")));
  let total = 0;
  let current = 0;
  let inNumber = false;
  const flush = () => {
    if (inNumber) found.add(String(total + current));
    total = current = 0;
    inNumber = false;
  };
  for (const word of text.toLowerCase().split(/[^a-z]+/)) {
    if (word in UNITS) {
      current += UNITS[word];
      inNumber = true;
      found.add(String(UNITS[word]));
    } else if (word in SCALES) {
      if (!inNumber) current = 1; // "a hundred"
      inNumber = true;
      if (word === "hundred") current *= 100;
      else {
        total += current * SCALES[word];
        current = 0;
      }
    } else if (!(word === "and" && inNumber)) flush();
  }
  flush();
  return found;
}

/**
 * Puts a placeholder in place of every number that neither the candidate nor
 * the resume stated (numbers inside [placeholders] are left alone), so a
 * stronger answer never hands them a figure they did not measure.
 */
function numberGuard(segments: Segment[], resume: string | undefined, lang: Language) {
  const stated = numbersIn([...segments.map((s) => s.answer), resume ?? ""].join("\n"));
  const replaced: string[] = [];
  const guard = (text: string) =>
    text
      .split(/(\[[^\]]*\])/)
      .map((part, i) =>
        i % 2 === 1
          ? part
          : part.replace(NUMBER, (n) => {
              if (stated.has(n.replace(/,/g, ""))) return n;
              replaced.push(n);
              return YOUR_NUMBER[lang];
            }),
      )
      .join("");
  return { guard, replaced };
}

/** Did the candidate say this, word for word? */
const quoteChecker = (segments: Segment[], lang: Language) =>
  phraseChecker(segments.map((s) => s.answer).join("\n"), lang);

function dimensionScores(reply: Partial<Reply>, said: (q: string) => boolean): DimensionScore[] {
  const given = list<Reply["dimensions"][number]>(reply.dimensions);
  return DIMENSIONS.map(({ id }): DimensionScore => {
    const d = given.find((g) => g?.id === id);
    const score = typeof d?.score === "number" && [1, 2, 3, 4].includes(d.score) ? d.score : null;
    const evidence: Evidence[] = list<Evidence>(d?.evidence)
      .map((e) => ({ quote: str(e?.quote), note: str(e?.note) }))
      .filter((e) => said(e.quote));
    const comment = str(d?.comment);
    const headline = str(d?.headline);
    if (!d || d.status === "not_probed" || score === null) {
      return { id, score: null, status: "not_probed", evidence, comment, headline };
    }
    if (evidence.length === 0) return { id, score: null, status: "no_evidence", evidence, comment, headline };
    return { id, score, status: "scored", evidence, comment, headline };
  });
}

function roundCards(segments: Segment[], reply: Partial<Reply>): RoundCard[] {
  const given = list<Reply["rounds"][number]>(reply.rounds);
  return segments.map((s) => {
    const r = given.find((g) => g?.round === s.round);
    return {
      round: s.round,
      speaker: s.speaker,
      difficulty: s.difficulty,
      question: s.question,
      answer: s.answer,
      unanswered: s.unanswered,
      summary: str(r?.summary),
      wentWell: str(r?.went_well),
      improve: str(r?.improve),
      betterOutline: list<unknown>(r?.better_outline).map(str).filter(Boolean),
    };
  });
}

function claimChecks(reply: Partial<Reply>, said: (q: string) => boolean): ClaimCheck[] {
  return list<Reply["claims"][number]>(reply.claims)
    .filter((c) => str(c?.claim) && CLAIM_STATUSES.includes(c.status as ClaimStatus))
    .map((c) => {
      const quote = str(c.quote);
      return {
        claim: str(c.claim),
        status: c.status as ClaimStatus,
        ...(quote && said(quote) ? { quote } : {}),
        note: str(c.note),
      };
    });
}

/**
 * Drills need a dimension and a question to rehearse. Unverified quotes and
 * resume lines are dropped, and numbers nobody stated become placeholders.
 */
function practiceDrills(
  reply: Partial<Reply>,
  segments: Segment[],
  said: (q: string) => boolean,
  resume: string | undefined,
  guard: (text: string) => string,
  lang: Language,
): PracticeDrill[] {
  const inResume = resume?.trim() ? phraseChecker(resume, lang) : () => false;
  const starOf = (p: Reply["practice"][number]) =>
    list<unknown>(p.star).filter((x): x is StarPart => x === "situation" || x === "task");
  const valid = list<Reply["practice"][number]>(reply.practice).filter(
    (p) =>
      str(p?.title) && str(p.question?.text) && (starOf(p).length > 0 || DIMENSIONS.some((d) => d.id === p.dimension)),
  );
  // Up to three drills from the rubric, then the opening's STAR drill if the judge wrote one.
  const picked = [
    ...valid.filter((p) => starOf(p).length === 0).slice(0, 3),
    ...valid.filter((p) => starOf(p).length > 0).slice(0, 1),
  ];
  return picked.map((p): PracticeDrill => {
    const star = starOf(p);
    const quote = str(p.quote);
    const resumeLine = str(p.resume_line);
    const asked = p.question.asked_by as Panelist | "moderator";
    const askers: (Panelist | "moderator")[] = star.length > 0 ? [...PANELISTS, "moderator"] : PANELISTS;
    return {
      title: str(p.title),
      dimension: star.length > 0 ? null : (p.dimension as DimensionId),
      ...(star.length > 0 ? { star } : {}),
      round: star.length > 0 ? 0 : segments.some((s) => s.round === p.round) ? (p.round as number) : null,
      ...(inResume(resumeLine) ? { resumeLine } : {}),
      issue: str(p.issue),
      quote: said(quote) ? quote : "",
      haveReady: list<unknown>(p.have_ready).map(str).filter(Boolean).slice(0, 3).map(guard),
      trySaying: guard(str(p.try_saying)),
      question: {
        speaker: askers.includes(asked) ? asked : star.length > 0 ? "moderator" : "technical_lead",
        text: guard(str(p.question.text)),
      },
    };
  });
}

const STAR_STATUSES: StarStatus[] = ["covered", "vague", "missing"];

/**
 * The opening's STAR coverage; a covered or vague part whose quote is not in
 * the opening becomes "no_evidence". Null when the opening went unanswered or
 * the judge gave no STAR.
 */
function starChecks(reply: Partial<Reply>, opening: Segment | undefined, lang: Language): StarCheck[] | null {
  if (!opening || opening.unanswered || typeof reply.star !== "object" || reply.star === null) return null;
  const inOpening = phraseChecker(opening.answer, lang);
  return STAR_PARTS.map(({ part }): StarCheck => {
    const given = reply.star![part];
    const note = str(given?.note);
    const status = STAR_STATUSES.find((s) => s === given?.status);
    if (status === "missing") return { part, status, note };
    const quote = str(given?.quote);
    if (!status || !inOpening(quote)) return { part, status: "no_evidence", note };
    return { part, status, quote, note };
  });
}

/**
 * The fallback drill when the opening never says what the problem was (S) or
 * what they set out to do (T) and the judge did not write a drill for it.
 * English only: in another language the report goes without it.
 */
const STAR_DRILLS: Record<
  "situation" | "task" | "both",
  Pick<PracticeDrill, "title" | "haveReady" | "trySaying"> & { ask: string; issue: string }
> = {
  situation: {
    title: "Open with the problem in one sentence",
    issue: "Your opening went straight into what you built without saying what problem it solved.",
    haveReady: ["Who had the problem", "What was going wrong or missing", "Why it mattered then"],
    trySaying:
      "[Who] had a problem: [what was going wrong or missing], and it mattered because [why it mattered then].",
    ask: "Before the details: what problem were you solving, and for whom?",
  },
  task: {
    title: "Say what you set out to achieve",
    issue: "Your opening never said what your own goal was, so the panel could not tell what success meant.",
    haveReady: ["Your goal in one sentence", "What done looked like"],
    trySaying: "My job was to [your goal], and it would count as done when [how you would know].",
    ask: "What exactly were you trying to achieve, and how would you know it worked?",
  },
  both: {
    title: "Open with the problem and your goal",
    issue:
      "Your opening went straight into what you built, without the problem it solved or what you set out to achieve.",
    haveReady: [
      "Who had the problem, and why it mattered",
      "What was going wrong or missing",
      "Your goal, and what done looked like",
    ],
    trySaying:
      "[Who] had a problem: [what was going wrong or missing]. My job was to [your goal], and it would count as done when [how you would know].",
    ask: "Before the details: what problem were you solving, for whom, and what was your goal?",
  },
};

function starFallback(star: StarCheck[] | null, practice: PracticeDrill[]): PracticeDrill | null {
  if (practice.some((p) => p.star)) return null;
  const missing = (star ?? []).filter((s) => s.status === "missing" && (s.part === "situation" || s.part === "task"));
  if (missing.length === 0) return null;
  const parts = missing.map((s) => s.part);
  const drill = STAR_DRILLS[parts.length === 2 ? "both" : (parts[0] as "situation" | "task")];
  return {
    title: drill.title,
    dimension: null,
    star: parts,
    round: 0,
    issue: drill.issue,
    quote: "",
    haveReady: drill.haveReady,
    trySaying: drill.trySaying,
    question: { speaker: "moderator", text: drill.ask },
  };
}

/**
 * The reply is about 2500 tokens. Was 16 000 with thinking on, whose reasoning shares the
 * budget (at 8000 one judge came back empty, perhaps out of budget).
 */
const JUDGE_MAX_TOKENS = 8000;
/**
 * Each attempt; a report takes about 15 s without thinking. With thinking on it took
 * 65-140 s, so a timeout is still not retried.
 */
const JUDGE_TIMEOUT_MS = 180_000;

const DEBRIEF_ORDER: (Panelist | "moderator")[] = ["technical_lead", "mentor", "moderator"];

/** One judge call; a reply without dimensions (bad or empty JSON) is retried once. */
async function judge(system: string, user: string): Promise<Partial<Reply>> {
  for (let attempt = 1; ; attempt++) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`the report judge timed out after ${JUDGE_TIMEOUT_MS / 1000} s`)),
        JUDGE_TIMEOUT_MS,
      );
    });
    // Without thinking, on the provider's faster model (DeepSeek: deepseek-flash), 2026-10-23: the
    // user found 140 s too long. On interview mvlt6e33 deepseek-v4-pro with thinking took 87 s
    // (7500 of its 9900 tokens were reasoning); deepseek-flash without it took 14 s and scored
    // every dimension the same. OpenAI, Claude and Gemini cannot switch reasoning off: lowest effort.
    const reply = await Promise.race([chatJson<Reply>(system, user, "fast", JUDGE_MAX_TOKENS, true), timeout]).finally(
      () => clearTimeout(timer),
    );
    if (Array.isArray(reply.dimensions) && reply.dimensions.length > 0) return reply;
    const keys = Object.keys(reply).join(", ") || "nothing (empty or broken JSON)";
    if (attempt === 2) throw new Error(`the report judge returned no dimensions; it returned ${keys}`);
    console.warn(`Report: the judge returned no dimensions (it returned ${keys}); retrying once`);
  }
}

/** Thrown when there is nothing to judge; the route answers 422 with its message. */
export class NothingToJudge extends Error {}

export async function buildReport(input: ReportInput): Promise<Report> {
  const lang = input.language ?? "en";
  const segments = segmentRounds(input);
  if (!segments.some((s) => !s.unanswered)) throw new NothingToJudge("the candidate answered nothing: no report");
  const reply = await judge(systemPrompt(lang), userPrompt(segments, input.resume));
  const said = quoteChecker(segments, lang);

  const numbers = numberGuard(segments, input.resume, lang);
  const practice = practiceDrills(reply, segments, said, input.resume, numbers.guard, lang);
  if (numbers.replaced.length > 0) {
    console.warn(`Report: replaced numbers nobody stated in the practice drills: ${numbers.replaced.join(", ")}`);
  }

  const star = starChecks(
    reply,
    segments.find((s) => s.round === 0),
    lang,
  );
  const added = lang === "en" ? starFallback(star, practice) : null;
  if (added) practice.push(added);

  const dimensions = dimensionScores(reply, said);
  const score = overallScore(
    Object.fromEntries(dimensions.map((d) => [d.id, d.score])) as Record<DimensionId, number | null>,
  );
  return {
    overall: {
      score: score === null ? null : Math.round(score * 100) / 100,
      band: score === null ? null : bandOf(score),
      summary: str(reply.summary),
    },
    project: str(reply.project),
    dimensions,
    practice,
    star,
    rounds: roundCards(segments, reply),
    claims: input.resume?.trim() ? claimChecks(reply, said) : null,
    otherProjects: input.resume?.trim()
      ? list<unknown>(reply.other_projects).map(str).filter(Boolean).slice(0, 4)
      : null,
    delivery: deliveryMetrics(input),
    debrief: DEBRIEF_ORDER.flatMap((speaker) => {
      const text = str(reply.debrief?.[speaker]);
      return text ? [{ speaker, text, headline: str(reply.debrief_headlines?.[speaker]) }] : [];
    }),
    model: await providerName(true),
    createdAt: new Date().toISOString(),
  };
}
