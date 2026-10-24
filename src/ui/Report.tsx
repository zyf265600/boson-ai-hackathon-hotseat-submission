import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Speaker } from "../../shared/panel";
import type { Person } from "../../shared/people";
import { LANGUAGES, type Language } from "../../shared/languages";
import { TONE } from "../../shared/questions";
import {
  BANDS,
  DIMENSIONS,
  STAR_PARTS,
  type ClaimCheck,
  type ClaimStatus,
  type DimensionId,
  type DimensionScore,
  type PracticeDrill,
  type Report,
  type RoundCard,
  type StarCheck,
  type StarPart,
} from "../../shared/report";
import { fetchLine, type Turn } from "../api";
import { confetti } from "./confetti";
import { downloadMarkdown, downloadPdf, reportFileName, reportMarkdown } from "./reportExport";
import { Icon, type IconName } from "./icons";

// The post-interview report on the end screen, laid out after the team's mock
// (doc/report-mock.html): a header with tabs, six summary tiles, the opening's
// STAR, the skills, the panel's spoken notes and the practice drills. The words
// come from the judge in the interview's language; the labels stay English, like
// the rest of the interface. Charts are plain SVG and HTML.

export type ReportState =
  | { status: "loading" }
  | { status: "ready"; report: Report }
  /** The interview never started: no report and no word about one. */
  | { status: "none" }
  /** Nothing to judge (the server's 422): the candidate answered no question. The transcript is shown. */
  | { status: "unscored" }
  | { status: "error"; message: string };

/** About the interview the report is on, from the browser (the inspector hub). */
export interface ReportMeta {
  interviewId: number;
  language: Language;
  startedAt: number | null;
  endedAt: number | null;
}

type Seat = Exclude<Speaker, "candidate">;

interface ReportViewProps {
  state: ReportState;
  meta: ReportMeta | null;
  people: Record<Speaker, Person>;
  turns: Turn[];
  onRetry: () => void;
  /** "Practice again": a new interview. */
  onPracticeAgain: () => void;
}

export function ReportView({ state, meta, people, turns, onRetry, onPracticeAgain }: ReportViewProps) {
  // Confetti once per ended interview, as soon as the report starts being written (2026-10-23,
  // the user's request: right when the interview ends, not 1–2 minutes later when the report
  // appears). A retry does not fire it again; nothing answered (no report) never fires it.
  const celebrated = useRef(false);
  const writing = state.status === "loading";
  useEffect(() => {
    if (writing && !celebrated.current) {
      celebrated.current = true;
      confetti();
    }
  }, [writing]);

  if (state.status === "loading") return <Loading />;
  // Whenever there is no score, say why and still show what was said (2026-10-24, the user's request).
  if (state.status === "error") {
    return (
      <>
        <section className="report report-failed" role="alert">
          <p>The report could not be written: {state.message}</p>
          <button className="ghost" onClick={onRetry}>
            Try again
          </button>
        </section>
        {turns.length > 0 && <Transcript turns={turns} people={people} />}
      </>
    );
  }
  if (state.status === "unscored") {
    return (
      <>
        <section className="report report-failed" role="status">
          <p>
            No score for this interview: it was too short to judge, with no answer to any question. Here is the
            transcript.
          </p>
        </section>
        {turns.length > 0 && <Transcript turns={turns} people={people} />}
      </>
    );
  }
  if (state.status === "none") return turns.length > 0 ? <Transcript turns={turns} people={people} /> : null;
  return (
    <ReadyReport report={state.report} meta={meta} people={people} turns={turns} onPracticeAgain={onPracticeAgain} />
  );
}

/** A large turning ring in the middle of the screen while the judge writes. */
function Loading() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <section className="report-loading" aria-live="polite" aria-busy="true">
      <div className="report-loader" aria-hidden="true">
        <span />
      </div>
      <h2>Writing your report</h2>
      <p className="muted">Your interviewers are going over your answers. This takes about 20 seconds.</p>
      <small className="muted report-elapsed">{seconds} s</small>
    </section>
  );
}

// ---------- Colors and small pieces ----------

/** The mock's status colors: good, middling, poor. */
const GREEN = "#1d9e75";
const AMBER = "#ef9f27";
const PINK = "#d4537e";
/** SVG colors are written on the marks, not in CSS, so the PDF picture (html-to-image) keeps them. */
const TRACK = "rgba(255, 255, 255, 0.1)";
const INK = "#e9eef4";

/** A score's color: 4 and 3 green, 2 amber, 1 pink. */
const scoreColor = (score: number) => (score >= 3 ? GREEN : score === 2 ? AMBER : PINK);

/** Four steps filled up to the score, in the score's color. */
function Steps({ score, label }: { score: number | null; label?: string }) {
  return (
    <span className="rp-seg" role={label ? "img" : undefined} aria-label={label}>
      {[1, 2, 3, 4].map((step) => (
        <i key={step} style={score !== null && step <= score ? { background: scoreColor(score) } : undefined} />
      ))}
    </span>
  );
}

const STAR_TONE: Record<StarCheck["status"], { label: string; color: string }> = {
  covered: { label: "Covered", color: GREEN },
  vague: { label: "Vague", color: AMBER },
  missing: { label: "Missing", color: PINK },
  no_evidence: { label: "Unverified", color: "" },
};

/** S, T, A or R in a square: filled when covered or vague, dashed when missing. */
function StarBadge({ part, status, small }: { part: StarPart; status: StarCheck["status"]; small?: boolean }) {
  const letter = STAR_PARTS.find((p) => p.part === part)!.letter;
  const { color } = STAR_TONE[status];
  const style =
    status === "missing"
      ? { border: `1.5px dashed ${PINK}`, color: PINK }
      : color
        ? { background: color, color: "#fff" }
        : { border: "1.5px dashed var(--l-muted)", color: "var(--l-muted)" };
  return (
    <span className={`rp-st${small ? " sm" : ""}`} style={style}>
      {letter}
    </span>
  );
}

/** Text with each [placeholder] shown as a dashed blank to fill in. */
function WithBlanks({ text }: { text: string }) {
  const parts = text.split(/\[([^\]]+)\]/);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <em key={i} className="rp-fill">
            {part}
          </em>
        ) : (
          part
        ),
      )}
    </>
  );
}

const stripBrackets = (text: string) => text.replace(/[[\]]/g, "");

function Avatar({ person, size = 26 }: { person: Person; size?: number }) {
  return (
    <span className="rp-av" style={{ background: person.color, width: size, height: size }} aria-hidden="true">
      {person.name.charAt(0)}
    </span>
  );
}

/** A summary tile: icon, title and (when it has a tab) a chevron to it, then the content. */
function Tile({
  icon,
  title,
  onOpen,
  children,
}: {
  icon: IconName;
  title: string;
  onOpen?: () => void;
  children: ReactNode;
}) {
  const head = (
    <>
      <Icon name={icon} size={18} />
      {title}
      {onOpen && (
        <span className="rp-go">
          <Icon name="chevronRight" size={16} />
        </span>
      )}
    </>
  );
  return (
    <div className="rp-k">
      {onOpen ? (
        <button className="rp-kh" onClick={onOpen}>
          {head}
        </button>
      ) : (
        <div className="rp-kh">{head}</div>
      )}
      {children}
    </div>
  );
}

// ---------- Playing the panel's lines in their voices ----------

/**
 * One line at a time in a seat's voice (POST /api/line: the interview's voice for that
 * seat, cached on the server). Returns what is playing and how long each line runs.
 */
function useVoice(meta: ReportMeta | null) {
  const ctx = useRef<AudioContext | null>(null);
  const source = useRef<AudioBufferSourceNode | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [durations, setDurations] = useState<Record<string, number>>({});

  useEffect(
    () => () => {
      source.current?.stop();
      void ctx.current?.close();
    },
    [],
  );

  function stop() {
    source.current?.stop();
    source.current = null;
    setPlaying(null);
  }

  async function play(key: string, seat: Seat, text: string) {
    if (playing === key) return stop();
    stop();
    if (!meta) return;
    ctx.current ??= new AudioContext({ sampleRate: 24_000 });
    void ctx.current.resume();
    setLoading(key);
    try {
      const pcm = new Int16Array(
        await fetchLine(seat, text, seat === "moderator" ? undefined : TONE[seat], meta.language, meta.interviewId),
      );
      const buffer = ctx.current.createBuffer(1, pcm.length, 24_000);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 32768;
      setDurations((d) => ({ ...d, [key]: buffer.duration }));
      const node = ctx.current.createBufferSource();
      node.buffer = buffer;
      node.connect(ctx.current.destination);
      node.onended = () => {
        if (source.current === node) {
          source.current = null;
          setPlaying(null);
        }
      };
      source.current = node;
      node.start();
      setPlaying(key);
    } catch {
      setPlaying(null);
    } finally {
      setLoading(null);
    }
  }

  return { play, playing, loading, durations };
}

type Voice = ReturnType<typeof useVoice>;

/** Roughly how long a line takes to say, before its audio is in. */
function spokenSeconds(text: string, lang: Language): number {
  return LANGUAGES[lang].countChars ? text.length / 5 : text.split(/\s+/).length / 2.6;
}

const clock = (seconds: number) => {
  const s = Math.max(1, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// ---------- The report ----------

type Tab = "overview" | "rounds" | "resume" | "transcript";

const SHORT: Record<DimensionId, string> = {
  depth: "Technical depth",
  tradeoffs: "Trade-offs",
  results: "Results",
  ownership: "Ownership",
  communication: "Clarity",
};

function ReadyReport({
  report,
  meta,
  people,
  turns,
  onPracticeAgain,
}: {
  report: Report;
  meta: ReportMeta | null;
  people: Record<Speaker, Person>;
  turns: Turn[];
  onPracticeAgain: () => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const voice = useVoice(meta);
  /** Making the PDF: every tab is laid out one after another, with every fold open, for the picture. */
  const [exporting, setExporting] = useState(false);
  /** Where the last download went, or why it failed. */
  const [saved, setSaved] = useState<{ ok: boolean; text: string } | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const heading = `${when(meta)} · ${(["moderator", "technical_lead", "mentor"] as const).map((s) => people[s].name).join(", ")}`;

  function saveMarkdown() {
    const name = reportFileName(meta?.startedAt ?? null, "md");
    downloadMarkdown(reportMarkdown(report, heading, people, turns), name);
    setSaved({ ok: true, text: `Saved ${name} to your browser's Downloads folder.` });
  }

  // Once every tab is on the page, open the folds, take the picture, and put the page back.
  useEffect(() => {
    if (!exporting || !body.current) return;
    const node = body.current;
    const folds = [...node.querySelectorAll("details")].filter((d) => !d.open);
    folds.forEach((d) => (d.open = true));
    const name = reportFileName(meta?.startedAt ?? null, "pdf");
    downloadPdf(node, name)
      .then(
        () => setSaved({ ok: true, text: `Saved ${name} to your browser's Downloads folder.` }),
        (err: Error) => setSaved({ ok: false, text: `The PDF could not be made: ${err.message}` }),
      )
      .finally(() => {
        folds.forEach((d) => (d.open = false));
        setExporting(false);
      });
  }, [exporting]);
  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "rounds", label: "Rounds" },
    ...(report.claims ? [{ id: "resume" as const, label: "Resume check" }] : []),
    { id: "transcript", label: "Transcript" },
  ];

  return (
    <section className="report" aria-label="Your interview report">
      <header className="rp-head">
        <div className="rp-head-row">
          <div className="rp-min">
            <p className="rp-meta">{heading}</p>
            <h2 className="rp-title">{report.project || "Your interview"}</h2>
          </div>
          <div className="rp-downloads">
            <button className="rp-btn" onClick={saveMarkdown}>
              <Icon name="download" size={15} />
              Markdown
            </button>
            <button className="rp-btn" onClick={() => setExporting(true)} disabled={exporting}>
              <Icon name="download" size={15} />
              {exporting ? "Making PDF…" : "PDF"}
            </button>
          </div>
        </div>
        {saved && (
          <p className={`rp-saved${saved.ok ? "" : " error"}`} role="status">
            <Icon name={saved.ok ? "check" : "close"} size={15} />
            {saved.text}
          </p>
        )}
        <div className="rp-tabs" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? "on" : ""}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div ref={body} className={exporting ? "rp-export" : undefined}>
        {exporting && (
          <div className="rp-export-head">
            <p className="rp-meta">{heading}</p>
            <h2 className="rp-title">{report.project || "Your interview"}</h2>
          </div>
        )}
        {(exporting || tab === "overview") && (
          <Overview
            report={report}
            meta={meta}
            people={people}
            voice={voice}
            onTab={setTab}
            onPracticeAgain={onPracticeAgain}
          />
        )}
        {exporting && <h3 className="rp-sec">Rounds</h3>}
        {(exporting || tab === "rounds") && <Rounds rounds={report.rounds} people={people} />}
        {exporting && report.claims && <h3 className="rp-sec">Resume check</h3>}
        {(exporting || tab === "resume") && report.claims && (
          <Claims claims={report.claims} otherProjects={report.otherProjects ?? []} />
        )}
        {exporting && turns.length > 0 && <h3 className="rp-sec">Transcript</h3>}
        {(exporting || tab === "transcript") && <Transcript turns={turns} people={people} />}
      </div>
    </section>
  );
}

/** "Oct 23, 17:38 – 17:42" from when the interview started and ended. */
function when(meta: ReportMeta | null): string {
  if (!meta?.startedAt) return "Your interview";
  const day = new Date(meta.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = (t: number) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${day}, ${time(meta.startedAt)}${meta.endedAt ? ` – ${time(meta.endedAt)}` : ""}`;
}

function Overview({
  report,
  meta,
  people,
  voice,
  onTab,
  onPracticeAgain,
}: {
  report: Report;
  meta: ReportMeta | null;
  people: Record<Speaker, Person>;
  voice: Voice;
  onTab: (tab: Tab) => void;
  onPracticeAgain: () => void;
}) {
  const scoreOf = (id: DimensionId) => report.dimensions.find((d) => d.id === id)?.score ?? null;
  return (
    <>
      <Tiles report={report} onTab={onTab} />

      {report.star && (
        <>
          <div className="rp-sec-row">
            <h3 className="rp-sec">Your opening</h3>
            <span className="rp-chip">STAR · shown, not scored</span>
          </div>
          <div className="rp-star">
            {report.star.map((s) => (
              <div key={s.part} className="rp-k rp-k-flat">
                <div className="rp-star-head">
                  <StarBadge part={s.part} status={s.status} />
                  <span>{STAR_PARTS.find((p) => p.part === s.part)!.label}</span>
                </div>
                <span className="rp-star-status" style={{ color: STAR_TONE[s.status].color || "var(--l-muted)" }}>
                  {STAR_TONE[s.status].label}
                </span>
                <div className="rp-qt">{s.quote ? `“${s.quote}”` : s.note}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <h3 className="rp-sec">Skills</h3>
      <div className="rp-skills">
        {report.dimensions.map((d) => (
          <Skill key={d.id} score={d} />
        ))}
      </div>

      {report.debrief.length > 0 && (
        <>
          <h3 className="rp-sec">From the panel</h3>
          <div className="rp-panel">
            {report.debrief.map((d) => {
              const key = `debrief-${d.speaker}`;
              const seconds = voice.durations[key] ?? spokenSeconds(d.text, meta?.language ?? "en");
              const name = people[d.speaker].name;
              return (
                <div key={d.speaker} className="rp-k rp-k-flat">
                  <div className="rp-kh">
                    <Avatar person={people[d.speaker]} size={30} />
                    {name}
                    <button
                      className="rp-play"
                      onClick={() => void voice.play(key, d.speaker, d.text)}
                      disabled={!meta || voice.loading === key}
                      aria-label={voice.playing === key ? `Stop ${name}` : `Hear ${name}`}
                    >
                      <Icon name={voice.playing === key ? "stop" : "play"} size={16} />
                    </button>
                  </div>
                  <span className="rp-sub2" title={d.text}>
                    {d.headline || d.text} · {clock(seconds)}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {report.practice.length > 0 && (
        <>
          <div className="rp-sec-row">
            <h3 className="rp-sec">Practice next</h3>
            <span className="rp-sub2 rp-inline">
              <Icon name="folder" size={15} />
              {report.project ? `${report.project} · ` : ""}
              {report.practice.length} drills
            </span>
          </div>
          <div className="rp-drills">
            {report.practice.map((p, i) => (
              <Drill
                key={i}
                n={i + 1}
                drill={p}
                score={p.dimension ? scoreOf(p.dimension) : null}
                star={report.star}
                people={people}
                voice={voice}
                canPlay={!!meta}
              />
            ))}
          </div>
        </>
      )}

      <div className="rp-foot">
        {report.otherProjects && report.otherProjects.length > 0 && (
          <>
            <span className="rp-sub2">Not asked yet, from your resume:</span>
            {report.otherProjects.map((name) => (
              <span key={name} className="rp-chip rp-chip-strong">
                <Icon name="folder" size={14} />
                {name}
              </span>
            ))}
          </>
        )}
        <button className="rp-btn rp-foot-btn" onClick={onPracticeAgain}>
          <Icon name="refresh" size={16} />
          Practice again
        </button>
      </div>
    </>
  );
}

function Tiles({ report, onTab }: { report: Report; onTab: (tab: Tab) => void }) {
  const { overall, dimensions, claims, delivery: d, rounds } = report;
  const band = BANDS.find((b) => b.band === overall.band);
  const bandTone =
    overall.band === "ready" || overall.band === "nearly" ? "good" : overall.band === "practice" ? "mid" : "low";
  const scored = dimensions.filter((x) => x.score !== null);
  const lowest = scored.length ? Math.min(...scored.map((x) => x.score!)) : null;
  const weakest = lowest !== null && lowest < 4 ? scored.find((x) => x.score === lowest)! : null;
  const answered = rounds.filter((r) => !r.unanswered).length;
  const ring = 2 * Math.PI * 26;

  return (
    <div className="rp-tiles">
      <Tile icon="trendingUp" title="Overall">
        <div className="rp-k-body">
          <div>
            <div className="rp-big">
              {overall.score === null ? "—" : Number(overall.score.toFixed(1))}
              <span className="rp-unit"> / 4</span>
            </div>
            <span className={`rp-band tone-${bandTone}`}>{band?.label ?? "Not scored"}</span>
          </div>
          <svg width="60" height="60" viewBox="0 0 64 64" aria-hidden="true" className="rp-flex-none">
            <circle cx="32" cy="32" r="26" fill="none" strokeWidth="9" stroke={TRACK} />
            <circle
              cx="32"
              cy="32"
              r="26"
              fill="none"
              stroke={GREEN}
              strokeWidth="9"
              strokeDasharray={`${((overall.score ?? 0) / 4) * ring} ${ring}`}
              strokeLinecap="round"
              transform="rotate(-90 32 32)"
            />
          </svg>
        </div>
      </Tile>

      <Tile icon="target" title="Weakest skill">
        <div className="rp-k-body">
          <div className="rp-min">
            <div className="rp-big rp-big-word">{weakest ? SHORT[weakest.id] : scored.length ? "None" : "—"}</div>
            <div className="rp-sub">
              {weakest
                ? `${weakest.score} / 4 · ${weakest.headline || "work on this first"}`
                : scored.length
                  ? "All scored skills at 4 / 4"
                  : "Nothing was scored"}
            </div>
          </div>
          <svg width="58" height="46" viewBox="0 0 62 46" aria-hidden="true" className="rp-flex-none">
            {dimensions.map((x, i) => {
              const h = x.score === null ? 6 : (x.score / 4) * 46;
              return (
                <rect
                  key={x.id}
                  x={i * 13}
                  y={46 - h}
                  width="8"
                  height={h}
                  rx="2"
                  fill={x.score === null ? TRACK : x === weakest ? AMBER : "#5dcaa5"}
                />
              );
            })}
          </svg>
        </div>
      </Tile>

      <Tile icon="fileCheck" title="Resume check" onOpen={claims ? () => onTab("resume") : undefined}>
        {claims ? <ClaimTile claims={claims} /> : <div className="rp-sub">No résumé was uploaded</div>}
      </Tile>

      <Tile icon="gauge" title="Speaking speed">
        <div className="rp-k-body">
          <div>
            <div className="rp-big">
              {d?.wpm ?? "—"}
              <span className="rp-unit rp-unit-sm"> wpm</span>
            </div>
            <div className="rp-sub">{d?.wpm == null ? "Too little speech to tell" : "Target 120–160"}</div>
          </div>
          <Gauge wpm={d?.wpm ?? null} />
        </div>
      </Tile>

      <Tile icon="mic" title="Speaking time">
        <SpeakingTime youMs={d?.speakingMs ?? null} panelMs={d?.panelMs ?? null} />
      </Tile>

      <Tile icon="question" title="Answered" onOpen={() => onTab("rounds")}>
        <div className="rp-k-body">
          <div>
            <div className="rp-big">
              {answered}
              <span className="rp-unit"> / {rounds.length}</span>
            </div>
            <div className="rp-sub">
              {d?.medianLatencyMs != null
                ? `${(d.medianLatencyMs / 1000).toFixed(1)} s to first word`
                : "Questions you answered"}
            </div>
          </div>
          <div className="rp-dots" aria-hidden="true">
            {rounds.map((r) => (
              <i key={r.round} style={{ background: r.unanswered ? "var(--rp-empty)" : GREEN }} />
            ))}
          </div>
        </div>
      </Tile>
    </div>
  );
}

const CLAIM_COLOR: Record<ClaimStatus, string> = {
  verified: GREEN,
  shallow: AMBER,
  mismatch: PINK,
  not_discussed: "var(--rp-empty)",
};

const CLAIM_LABELS: Record<ClaimStatus, string> = {
  verified: "Verified",
  shallow: "Shallow",
  mismatch: "Mismatch",
  not_discussed: "Not discussed",
};

function ClaimTile({ claims }: { claims: ClaimCheck[] }) {
  const verified = claims.filter((c) => c.status === "verified").length;
  const others = (["shallow", "mismatch", "not_discussed"] as const)
    .map((status) => ({ status, n: claims.filter((c) => c.status === status).length }))
    .filter((x) => x.n > 0)
    .map((x) => `${x.n} ${CLAIM_LABELS[x.status].toLowerCase()}`);
  return (
    <div className="rp-k-body">
      <div>
        <div className="rp-big">
          {verified}
          <span className="rp-unit"> / {claims.length}</span>
        </div>
        <div className="rp-sub">
          {others.length ? others.join(" · ") : claims.length ? "All verified" : "No claims found"}
        </div>
      </div>
      <div className="rp-squares" aria-hidden="true">
        {claims.map((c, i) => (
          <i key={i} style={{ background: CLAIM_COLOR[c.status] }} />
        ))}
      </div>
    </div>
  );
}

/** A half-circle gauge from 60 to 240 words a minute, with 120–160 marked green. */
function Gauge({ wpm }: { wpm: number | null }) {
  const MIN = 60;
  const MAX = 240;
  const point = (value: number, r = 40) => {
    const t = (Math.min(Math.max(value, MIN), MAX) - MIN) / (MAX - MIN);
    const a = Math.PI * (1 - t);
    return [50 + r * Math.cos(a), 50 - r * Math.sin(a)];
  };
  const [bx1, by1] = point(120);
  const [bx2, by2] = point(160);
  const [nx, ny] = point(wpm ?? MIN, 30);
  return (
    <svg width="76" height="44" viewBox="0 0 100 56" aria-hidden="true" className="rp-flex-none">
      <path d="M10 50 A40 40 0 0 1 90 50" fill="none" strokeWidth="12" stroke={TRACK} />
      <path d={`M${bx1} ${by1} A40 40 0 0 1 ${bx2} ${by2}`} fill="none" stroke={GREEN} strokeWidth="12" />
      {wpm !== null && <line x1="50" y1="50" x2={nx} y2={ny} strokeWidth="3" strokeLinecap="round" stroke={INK} />}
      <circle cx="50" cy="50" r="4" fill={INK} />
    </svg>
  );
}

function SpeakingTime({ youMs, panelMs }: { youMs: number | null; panelMs: number | null }) {
  if (youMs === null) return <div className="rp-sub">Not measured for this interview</div>;
  const minutes = (ms: number) => `${(ms / 60_000).toFixed(1)} min`;
  const total = youMs + (panelMs ?? 0);
  const share = total > 0 ? Math.round((youMs / total) * 100) : 100;
  return (
    <div>
      <div className="rp-split-labels">
        <span>You</span>
        <span>Panel</span>
      </div>
      <div className="rp-split">
        <div style={{ width: `${share}%`, background: PINK }} />
        <div style={{ flex: 1, background: "#72243e" }} />
      </div>
      <div className="rp-split-labels rp-sub">
        <span>
          {minutes(youMs)}
          {panelMs !== null ? ` · ${share}%` : ""}
        </span>
        <span>{panelMs !== null ? minutes(panelMs) : "—"}</span>
      </div>
    </div>
  );
}

function Skill({ score }: { score: DimensionScore }) {
  const { label } = DIMENSIONS.find((d) => d.id === score.id)!;
  const note =
    score.status === "not_probed"
      ? "Not covered in this interview"
      : score.status === "no_evidence"
        ? "No supporting quote"
        : score.headline || score.comment;
  return (
    <details className="rp-skill">
      <summary>
        <span>{label}</span>
        <Steps score={score.score} label={`${label}: ${score.score ?? "not scored"} of 4`} />
        <span className="rp-sub2">{note}</span>
        <span className="rp-chev">
          <Icon name="chevronRight" size={16} />
        </span>
      </summary>
      <div className="rp-skill-more">
        {score.comment && <p>{score.comment}</p>}
        {score.evidence.map((e, i) => (
          <blockquote key={i}>
            “{e.quote}”{e.note && <small> — {e.note}</small>}
          </blockquote>
        ))}
      </div>
    </details>
  );
}

function Drill({
  n,
  drill: p,
  score,
  star,
  people,
  voice,
  canPlay,
}: {
  n: number;
  drill: PracticeDrill;
  score: number | null;
  star: StarCheck[] | null;
  people: Record<Speaker, Person>;
  voice: Voice;
  canPlay: boolean;
}) {
  const where = p.round === null ? null : p.round === 0 ? "Opening" : `Round ${p.round}`;
  const key = `drill-${n}`;
  const asker = people[p.question.speaker];
  const question = stripBrackets(p.question.text);
  return (
    <div className={`rp-pc${p.star ? " rp-pc-star" : ""}`}>
      <div className="rp-pt">
        <span className="rp-pn">{n}</span>
        <div className="rp-pc-title">{p.title}</div>
        <span className="rp-sub2 rp-flex-none">
          {[where, p.star ? "STAR" : p.dimension ? SHORT[p.dimension] : null].filter(Boolean).join(" · ")}
        </span>
        {p.star ? (
          <span className="rp-badges">
            {p.star.map((part) => (
              <StarBadge
                key={part}
                part={part}
                status={star?.find((s) => s.part === part)?.status ?? "missing"}
                small
              />
            ))}
          </span>
        ) : (
          <Steps score={score} />
        )}
      </div>
      {p.resumeLine && (
        <div className="rp-res">
          <Icon name="doc" size={14} />
          <span>
            Resume: <span className="rp-strong">“{p.resumeLine}”</span>
          </span>
        </div>
      )}
      <div className="rp-issue">{p.issue}</div>
      {p.haveReady.length > 0 && (
        <div>
          <div className="rp-lbl">Have ready</div>
          <div className="rp-hr">
            {p.haveReady.map((fact, i) => (
              <span key={i}>
                <Icon name="square" size={14} />
                {stripBrackets(fact)}
              </span>
            ))}
          </div>
        </div>
      )}
      <details className="rp-sample">
        <summary>
          <Icon name="chevronRight" size={13} />
          Sample answer
        </summary>
        <p>
          <WithBlanks text={p.trySaying} />
        </p>
      </details>
      <div className="rp-ask">
        <Avatar person={asker} />
        <div className="rp-min rp-grow">
          <div className="rp-lbl">{asker.name} will likely ask</div>
          <div className="rp-ask-q">“{question}”</div>
        </div>
        <button
          className="rp-btn rp-flex-none"
          onClick={() => void voice.play(key, p.question.speaker, question)}
          disabled={!canPlay || voice.loading === key}
          aria-label={`Hear ${asker.name} ask it`}
        >
          <Icon name={voice.playing === key ? "stop" : "mic"} size={15} />
          {voice.playing === key ? "Stop" : "Rehearse"}
        </button>
      </div>
    </div>
  );
}

function Rounds({ rounds, people }: { rounds: RoundCard[]; people: Record<Speaker, Person> }) {
  return (
    <div className="rp-drills rp-tab-body">
      {rounds.map((r) => (
        <div key={r.round} className="rp-pc">
          <div className="rp-pt">
            <span className="rp-pn">{r.round}</span>
            <div className="rp-pc-title">{r.round === 0 ? "Opening" : `Round ${r.round}`}</div>
            <span className="rp-sub2 rp-flex-none">
              {people[r.speaker].name}
              {r.difficulty ? ` · ${r.difficulty}` : ""}
            </span>
          </div>
          <div className="rp-qblock">{r.question}</div>
          {r.unanswered ? <div className="rp-sub2">Not answered</div> : <div className="rp-issue">{r.summary}</div>}
          {r.wentWell && (
            <div className="rp-issue">
              <span className="rp-tag-good">Went well</span> {r.wentWell}
            </div>
          )}
          {r.improve && (
            <div className="rp-issue">
              <span className="rp-tag-improve">Improve</span> {r.improve}
            </div>
          )}
          {r.betterOutline.length > 0 && (
            <details className="rp-sample">
              <summary>
                <Icon name="chevronRight" size={13} />A stronger answer would cover
              </summary>
              <ul>
                {r.betterOutline.map((point, i) => (
                  <li key={i}>
                    <WithBlanks text={point} />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}

function Claims({ claims, otherProjects }: { claims: ClaimCheck[]; otherProjects: string[] }) {
  return (
    <div className="rp-tab-body">
      <div className="rp-skills">
        {claims.map((c, i) => (
          <div key={i} className="rp-claim">
            <span className="rp-claim-status">
              <i style={{ background: CLAIM_COLOR[c.status] }} />
              {CLAIM_LABELS[c.status]}
            </span>
            <div className="rp-min">
              <div className="rp-strong">{c.claim}</div>
              {c.quote && <div className="rp-qt">“{c.quote}”</div>}
              {c.note && <div className="rp-sub">{c.note}</div>}
            </div>
          </div>
        ))}
        {claims.length === 0 && (
          <div className="rp-sub rp-pad">No claims about this project were found in the résumé.</div>
        )}
      </div>
      {otherProjects.length > 0 && (
        <div className="rp-foot">
          <span className="rp-sub2">Not asked yet, from your resume:</span>
          {otherProjects.map((name) => (
            <span key={name} className="rp-chip rp-chip-strong">
              <Icon name="folder" size={14} />
              {name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Transcript({ turns, people }: { turns: Turn[]; people: Record<Speaker, Person> }) {
  return (
    <ol className="ended-transcript rp-tab-body">
      {turns.map((t) => (
        <li key={t.id}>
          <span className="side-who" style={{ color: people[t.speaker].color }}>
            {people[t.speaker].name}
          </span>
          <p>{t.text}</p>
        </li>
      ))}
    </ol>
  );
}
