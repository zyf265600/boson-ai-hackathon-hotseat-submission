import type { CSSProperties } from "react";
import { ASKERS, DIFFICULTIES, INTERVIEW_LENGTHS, type Difficulty } from "../../shared/panel";
import { PEOPLE } from "../../shared/people";
import type { InterviewSettings } from "../../shared/settings";
import { Icon } from "./icons";
import { SeatAvatar } from "./InterviewersStep";

interface SettingsStepProps {
  settings: InterviewSettings;
  /** Difficulty of each asker's follow-up questions, in ASKERS order. */
  difficulties: Difficulty[];
  onDifficulty: (asker: number, difficulty: Difficulty) => void;
  /** Interview length in minutes (one of INTERVIEW_LENGTHS). */
  lengthMin: number;
  onLength: (minutes: number) => void;
  onBack: () => void;
}

const DIFFICULTY_NAMES: Record<Difficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

/** Step 3 of the prep room: how hard each interviewer asks, and how long the interview runs. */
export function SettingsStep({ settings, difficulties, onDifficulty, lengthMin, onLength, onBack }: SettingsStepProps) {
  const lengthStop = Math.max(0, INTERVIEW_LENGTHS.indexOf(lengthMin));
  const lastStop = INTERVIEW_LENGTHS.length - 1;

  return (
    <div className="step-body">
      <section className="prep-section" aria-labelledby="settings-title">
        <h3 id="settings-title">Interview settings</h3>
        <p className="muted section-note">
          {settings.seats.moderator.name} opens and you introduce one project. Then the two interviewers take turns
          asking follow-ups until time is up. Hard is what an engineer would ask after reading your project.
        </p>
        <ol className="plan-rows">
          {ASKERS.map((r, i) => {
            const p = PEOPLE[r.speaker];
            const name = settings.seats[r.speaker].name;
            return (
              <li key={i}>
                <SeatAvatar seat={r.speaker} settings={settings} small />
                <div className="plan-label">
                  {/* One line each, so both rows are the same height. */}
                  <strong>
                    {name} <span className="plan-role">{p.role}</span>
                  </strong>
                  <small>{r.label}</small>
                </div>
                {/* A thumb slides to the chosen level, like the length slider's knob (2026-10-23). */}
                <div
                  className="segmented slide"
                  role="radiogroup"
                  aria-label={`${name}'s difficulty`}
                  style={{ "--i": Math.max(0, DIFFICULTIES.indexOf(difficulties[i])) } as CSSProperties}
                >
                  <span className="seg-thumb" aria-hidden="true" />
                  {DIFFICULTIES.map((d) => (
                    <button
                      key={d}
                      role="radio"
                      aria-checked={difficulties[i] === d}
                      className={difficulties[i] === d ? "on" : ""}
                      onClick={() => onDifficulty(i, d)}
                    >
                      {DIFFICULTY_NAMES[d]}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ol>
        <div className="length">
          <div className="length-head">
            <label htmlFor="interview-length">
              <strong>Interview length</strong>
            </label>
            <span className="length-value">{lengthMin} min</span>
          </div>
          {/*
           * A pill-shaped rail with the knob inside it (2026-10-23, the user asked for the
           * knob to sit within the bar). The real range input lies on top, invisible, so
           * dragging, keys and screen readers work as before; its thumb is the knob's size.
           */}
          <div className="length-track" style={{ "--p": lengthStop / lastStop } as CSSProperties}>
            <div className="length-rail">
              <span className="length-fill" aria-hidden="true" />
              {INTERVIEW_LENGTHS.map((m, i) => (
                <span
                  key={m}
                  aria-hidden="true"
                  className={`length-dot ${i <= lengthStop ? "on" : ""}`}
                  style={{ "--at": i / lastStop } as CSSProperties}
                />
              ))}
              <span className="length-knob" aria-hidden="true">
                {lengthMin}
              </span>
              <input
                id="interview-length"
                type="range"
                min={0}
                max={lastStop}
                step={1}
                value={lengthStop}
                aria-valuetext={`${lengthMin} minutes`}
                onChange={(e) => onLength(INTERVIEW_LENGTHS[Number(e.target.value)])}
              />
            </div>
            <div className="length-stops" aria-hidden="true">
              {INTERVIEW_LENGTHS.map((m, i) => (
                <button
                  key={m}
                  type="button"
                  tabIndex={-1}
                  className={m === lengthMin ? "on" : ""}
                  style={{ "--at": i / lastStop } as CSSProperties}
                  onClick={() => onLength(m)}
                >
                  {m} min
                </button>
              ))}
            </div>
          </div>
          <small className="muted">When time is up, the moderator wraps up after you finish your current answer.</small>
        </div>
      </section>

      <footer className="step-nav">
        <button className="small-btn" onClick={onBack}>
          <Icon name="chevronLeft" size={18} />
          Back
        </button>
        <small className="muted">All set? Join when you are ready.</small>
      </footer>
    </div>
  );
}
