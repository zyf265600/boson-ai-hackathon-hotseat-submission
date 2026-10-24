import { useEffect, useRef, useState } from "react";
import type { Speaker } from "../../shared/panel";
import type { Person } from "../../shared/people";
import { DEFAULT_SETTINGS, peopleFor } from "../../shared/settings";
import { AUDIO_RATE } from "../realtime/sessionConfig";
import { ASKERS, askerIndex } from "../../shared/panel";
import { backupQuestions } from "../../corpus/backup-questions";
import {
  CHANNEL,
  PHASE_LABELS,
  modeLabel,
  type ChannelMessage,
  type InspectorState,
  type Interviewer,
  type TtsState,
} from "./types";

const SEATS: Interviewer[] = ["moderator", "technical_lead", "mentor"];

/** The panel with this interview's names (the prep room's); roles and colors as always. */
const peopleOf = (state: InspectorState) => peopleFor(state.settings ?? DEFAULT_SETTINGS);

/** Rough speaking rate, used to place the playhead in text that is still streaming. */
const CHARS_PER_SECOND = 15;

const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

const stamp = (t: number) =>
  new Date(t).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

function clock(t: number, start: number | null): string {
  const s = Math.max(0, Math.floor((t - (start ?? t)) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Log timestamps: mm:ss.mmm since the interview started. */
function clockMs(t: number, start: number | null): string {
  const ms = Math.max(0, t - (start ?? t));
  return `${clock(t, start)}.${String(ms % 1000).padStart(3, "0")}`;
}

function Meter({ value }: { value: number }) {
  // Same loudness curve as the call's speaking ring.
  const level = Math.min(1, Math.sqrt(value) * 2.2);
  return (
    <div className="insp-meter">
      <div style={{ width: `${level * 100}%` }} />
    </div>
  );
}

/** The TTS line with the part already heard highlighted. */
function TtsCard({
  tts,
  meters,
  playing,
  people: PEOPLE,
}: {
  tts: TtsState;
  meters: InspectorState["meters"];
  playing: boolean;
  people: Record<Speaker, Person>;
}) {
  const receivedSec = tts.bytes / 2 / AUDIO_RATE;
  // Once the floor has moved on, the whole line has been heard.
  const played = playing ? meters.played : tts.received ? receivedSec : 0;
  const heardChars =
    tts.received && receivedSec > 0
      ? Math.round((played / receivedSec) * tts.text.length)
      : Math.round(played * CHARS_PER_SECOND);
  const cut = Math.min(tts.text.length, heardChars);
  const state = tts.firstByteMs === null ? "waiting for first byte" : tts.received ? "all audio received" : "streaming";

  return (
    <section className="insp-card">
      <header className="insp-card-head">
        <h2>TTS stream</h2>
        <span className={`insp-pill tts-${tts.firstByteMs === null ? "wait" : tts.received ? "done" : "live"}`}>
          {state}
        </span>
      </header>
      <div className="insp-tts-who">
        <span style={{ color: PEOPLE[tts.speaker].color }}>{PEOPLE[tts.speaker].name}</span>
        <span className="insp-emotion">{tts.emotion}</span>
      </div>
      <p className="insp-tts-text">
        <mark>{tts.text.slice(0, cut)}</mark>
        {tts.text.slice(cut)}
      </p>
      <dl className="insp-stats">
        <div>
          <dt>First byte</dt>
          <dd>{tts.firstByteMs === null ? "…" : `${tts.firstByteMs} ms`}</dd>
        </div>
        <div>
          <dt>Audio received</dt>
          <dd>{receivedSec.toFixed(1)} s</dd>
        </div>
        <div>
          <dt>Played</dt>
          <dd>{played.toFixed(1)} s</dd>
        </div>
        <div>
          <dt>Input</dt>
          <dd>{tts.text.length} chars</dd>
        </div>
      </dl>
      <div className="insp-progress" title="Played / audio received so far">
        <div style={{ width: `${receivedSec > 0 ? Math.min(100, (played / receivedSec) * 100) : 0}%` }} />
      </div>
    </section>
  );
}

/** The two askers with the difficulty picked in the lobby, and how many follow-ups each has asked. */
function PlanStrip({ state }: { state: InspectorState }) {
  const PEOPLE = peopleOf(state);
  const last = state.questions.at(-1);
  return (
    <section className="insp-plan" aria-label="Follow-up plan">
      <span className="insp-plan-title">Follow-up difficulty</span>
      {ASKERS.map((r, i) => {
        const rounds = new Set(
          state.questions.filter((c) => c.result && askerIndex(c.round) === i).map((c) => c.round),
        );
        const writing = last && !last.result && askerIndex(last.round) === i;
        const status = writing ? `writing follow-up ${last.round}` : `${rounds.size} asked`;
        return (
          <div key={i} className={`insp-plan-round ${writing ? "now" : rounds.size ? "done" : ""}`}>
            <strong style={{ color: PEOPLE[r.speaker].color }}>{PEOPLE[r.speaker].name}</strong>
            <span>{r.label}</span>
            <span className="insp-diff">{state.difficulties[i] ?? "medium"}</span>
            <span className="insp-plan-status">{status}</span>
          </div>
        );
      })}
    </section>
  );
}

/** Seconds of silence after which the planned prompts fire (src/interview.ts SILENCE_STEPS); 35 s marks the question unanswered. */
const SILENCE_MARKS = [8, 15, 25, 35];

/** Live pause timer and every "has the candidate finished?" check. */
function TurnCard({ state, now }: { state: InspectorState; now: number }) {
  const { turn } = state;
  const quiet = turn.quietSince !== null && state.endedAt === null ? Math.max(0, now - turn.quietSince) : null;
  const limit = SILENCE_MARKS[SILENCE_MARKS.length - 1];
  return (
    <section className="insp-card">
      <header className="insp-card-head">
        <h2>Turn detection</h2>
        <span className="insp-pill">
          {turn.manual === null ? "starting" : turn.manual ? "Done answering (backup)" : "Silero VAD + deepseek-flash"}
        </span>
      </header>
      <div className="insp-pause">
        <span>
          {turn.talking ? "candidate talking" : quiet !== null ? "candidate silent for" : "not the candidate's turn"}
        </span>
        <strong>{quiet !== null ? secs(quiet) : "—"}</strong>
      </div>
      <div className="insp-pause-bar" title="Silence so far against the planned prompt times">
        <div style={{ width: `${quiet !== null ? Math.min(100, (quiet / 1000 / limit) * 100) : 0}%` }} />
        {SILENCE_MARKS.map((m) => (
          <span key={m} style={{ left: `${(m / limit) * 100}%` }}>
            {m} s
          </span>
        ))}
      </div>
      <p className="insp-note">
        Marks: prompts at 8 / 15 / 25 s of silence (not counting the prompts themselves); at 35 s the question is marked
        unanswered.
      </p>
      {turn.checks.length === 0 && <p className="insp-empty">No pause checked yet.</p>}
      <ol className="insp-checks">
        {[...turn.checks].reverse().map((c) => (
          <li key={c.t} className={c.stale ? "stale" : ""}>
            <div className="insp-row">
              <span className="insp-time">{clockMs(c.t, state.startedAt)}</span>
              <span className={`insp-pill verdict-${c.finished ? "done" : "more"}`}>
                {c.finished ? "finished" : "not finished"}
              </span>
              <span>{c.source === "deepseek" ? "deepseek-flash" : "fallback rule"}</span>
              <span className="insp-time">{c.ms} ms</span>
              {c.stale && <span className="insp-time">ignored: spoke again</span>}
            </div>
            <p className="insp-check-text">…{c.answer.slice(-140)}</p>
            {c.reason && <p className="insp-note">{c.reason}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** This interview's backup questions: each asker's, at the difficulty picked in the lobby, used in turn. */
function BackupCard({ state }: { state: InspectorState }) {
  const PEOPLE = peopleOf(state);
  return (
    <section className="insp-card">
      <header className="insp-card-head">
        <h2>Backup questions</h2>
        <span className="insp-pill">not used yet</span>
      </header>
      <p className="insp-note">
        Asked if the Orchestrator gives no question within 3.5 s or fails (corpus/backup-questions.ts); loaded at the
        start.
      </p>
      <ol className="insp-backup">
        {ASKERS.map((r, i) => {
          const difficulty = state.difficulties[i] ?? "medium";
          return (
            <li key={i}>
              <div className="insp-row">
                <strong style={{ color: PEOPLE[r.speaker].color }}>{PEOPLE[r.speaker].name}</strong>
                <span className="insp-diff">{difficulty}</span>
              </div>
              {/* The test tools show the English set; the interview uses its own language's. */}
              {backupQuestions("en", r.speaker, difficulty).map((q) => (
                <p key={q}>{q}</p>
              ))}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * Test mode window. It only watches: the interview window owns the session
 * and broadcasts its state on the "hotseat-inspector" channel.
 */
export function Inspector() {
  const [state, setState] = useState<InspectorState | null>(null);
  /** Another interview started after this one; it has its own inspector window. */
  const [newerSession, setNewerSession] = useState(false);
  const [now, setNow] = useState(Date.now());
  const memoryEnd = useRef<HTMLLIElement>(null);
  const logEnd = useRef<HTMLLIElement>(null);

  useEffect(() => {
    document.title = "HotSeat · Inspector";
    // Follow the session named in the URL; without one, follow the first session heard.
    let session = new URLSearchParams(location.search).get("session");
    const channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (e: MessageEvent<ChannelMessage>) => {
      if (e.data.type !== "state" || !e.data.state.sessionId) return;
      session ??= e.data.state.sessionId;
      if (e.data.state.sessionId === session) setState(e.data.state);
      else setNewerSession(true);
    };
    // Ask for a snapshot in case the interview started before this window.
    channel.postMessage({ type: "hello" } satisfies ChannelMessage);
    // 0.1 s, so the pause timer reads to a tenth of a second.
    const tick = setInterval(() => setNow(Date.now()), 100);
    return () => {
      clearInterval(tick);
      channel.close();
    };
  }, []);

  useEffect(() => {
    memoryEnd.current?.scrollIntoView({ block: "nearest" });
  }, [state?.memory.length]);
  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: "nearest" });
  }, [state?.log.length]);

  if (!state) {
    return (
      <div className="insp insp-waiting">
        <h1>HotSeat Inspector</h1>
        <p>Waiting for the interview window… Start an interview with Test mode on.</p>
      </div>
    );
  }

  const { seats, meters, tts } = state;
  const PEOPLE = peopleOf(state);
  const ended = state.endedAt !== null;
  const ttsPlaying = !ended && tts !== null && state.floor === tts.speaker;

  return (
    <div className="insp">
      <header className="insp-top">
        <h1>HotSeat Inspector</h1>
        <span className="insp-pill">⏱ {clock(state.endedAt ?? now, state.startedAt)}</span>
        {state.startedAt !== null && <span className="insp-pill">started {stamp(state.startedAt)}</span>}
        <span className="insp-pill">
          session {state.sessionId}
          {state.interviewId !== null && ` · interview #${state.interviewId}`}
        </span>
        {ended ? (
          <span className="insp-pill closed">session closed</span>
        ) : (
          <span className="insp-pill live">● live</span>
        )}
        <span
          className={`insp-pill ${state.llm.backup === null ? "" : state.llm.backup ? "mode-backup" : "mode-single"}`}
          title="From the LLM check before Join"
        >
          {modeLabel(state.llm.backup)} · Orchestrator: {state.llm.provider ?? "unknown"}
        </span>
        <span className={`insp-pill phase-${state.phase}`}>stage: {PHASE_LABELS[state.phase]}</span>
        <span className="insp-pill">speaker: {state.floor ? PEOPLE[state.floor].name : "nobody"}</span>
      </header>

      {ended && (
        <div className="insp-closed">
          <strong>Session closed</strong> at {stamp(state.endedAt!)} · {state.endReason}. Everything below is the final
          record of this interview.
          {newerSession && " A newer interview is running in its own inspector window."}
        </div>
      )}

      <PlanStrip state={state} />

      <section className="insp-seats">
        {SEATS.map((s) => {
          const seat = seats[s];
          const p = PEOPLE[s];
          return (
            <article key={s} className={`insp-seat status-${seat.status}`}>
              <header>
                <span className="insp-avatar" style={{ background: p.color }}>
                  {p.name.charAt(0)}
                </span>
                <div>
                  <strong>{p.name}</strong>
                  <small>
                    {p.role} · {s === "moderator" ? "Higgs Realtime" : "Higgs TTS 3"}
                  </small>
                </div>
                <span className="insp-pill status">{seat.status}</span>
              </header>
              {s !== "moderator" && (
                <div className="insp-row">
                  emotion <span className="insp-emotion">{seat.emotion || "—"}</span>
                </div>
              )}
              {seat.note && <div className="insp-note">{seat.note}</div>}
              <p className="insp-line">{seat.line || "—"}</p>
              <Meter value={state.floor === s ? meters.panel : 0} />
            </article>
          );
        })}
        <article className={`insp-seat status-${state.floor === "candidate" ? "speaking" : "idle"}`}>
          <header>
            <span className="insp-avatar" style={{ background: PEOPLE.candidate.color }}>
              Y
            </span>
            <div>
              <strong>Candidate</strong>
              <small>microphone → Higgs Realtime STT</small>
            </div>
            <span className="insp-pill status">{state.floor === "candidate" ? "answering" : "waiting"}</span>
          </header>
          <div className="insp-note">Live (browser speech recognition, replaced by Higgs STT)</div>
          <p className="insp-line">{state.candidateLive || "—"}</p>
          <Meter value={meters.mic} />
        </article>
      </section>

      <section className="insp-mid">
        {tts ? (
          <TtsCard tts={tts} meters={meters} playing={ttsPlaying} people={PEOPLE} />
        ) : (
          <section className="insp-card">
            <header className="insp-card-head">
              <h2>TTS stream</h2>
            </header>
            <p className="insp-empty">No panelist line yet.</p>
          </section>
        )}

        <section className="insp-card">
          <header className="insp-card-head">
            <h2>Orchestrator questions</h2>
            <span className="insp-pill">{state.questions.length} calls</span>
          </header>
          {state.questions.length === 0 && <p className="insp-empty">Not called yet.</p>}
          <ol className="insp-questions">
            {[...state.questions].reverse().map((c) => (
              <li key={c.round + "-" + c.startedAt}>
                <div className="insp-row">
                  <strong>Round {c.round}</strong>
                  <span className="insp-diff">{c.difficulty}</span>
                  <span>{c.mode === "fast" ? "no thinking" : "thinking"}</span>
                  {c.result?.provider && <span className="insp-time">{c.result.provider}</span>}
                  <span style={{ color: PEOPLE[c.speaker].color }}>{PEOPLE[c.speaker].name}</span>
                  <span className="insp-time">
                    {c.ms === null ? `thinking… ${secs(now - c.startedAt)}` : `${c.ms} ms`}
                  </span>
                </div>
                {c.result && <pre>{JSON.stringify(c.result, null, 2)}</pre>}
              </li>
            ))}
          </ol>
        </section>

        <TurnCard state={state} now={now} />
        <BackupCard state={state} />
      </section>

      <section className="insp-bottom">
        <section className="insp-card">
          <header className="insp-card-head">
            <h2>Conversation memory</h2>
            <span className="insp-pill">{state.memory.length} turns · what the Orchestrator reads</span>
          </header>
          <ol className="insp-memory">
            {state.memory.map((t, i) => (
              <li key={t.id}>
                <span className="insp-idx">{i + 1}</span>
                <span className="insp-who" style={{ color: PEOPLE[t.speaker].color }}>
                  {PEOPLE[t.speaker].name}
                </span>
                <span>{t.text}</span>
              </li>
            ))}
            <li ref={memoryEnd} aria-hidden="true" />
          </ol>
        </section>

        <section className="insp-card">
          <header className="insp-card-head">
            <h2>Event log</h2>
          </header>
          <ol className="insp-log">
            {state.log.map((l, i) => (
              <li key={i} className={l.error ? "error" : ""}>
                <span className="insp-time">{clockMs(l.t, state.startedAt)}</span> {l.text}
              </li>
            ))}
            <li ref={logEnd} aria-hidden="true" />
          </ol>
        </section>
      </section>
    </div>
  );
}
