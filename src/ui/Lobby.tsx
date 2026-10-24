import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { LiveBars, Waveform } from "./Waveform";
import { useMicLevel } from "./useMicLevel";
import { UserMenu, type Role } from "./UserMenu";
import { ResumeStep } from "./ResumeStep";
import { InterviewersStep } from "./InterviewersStep";
import { SettingsStep } from "./SettingsStep";
import { HOME, navigate } from "../router";
import type { Difficulty } from "../../shared/panel";
import type { InterviewSettings } from "../../shared/settings";

interface LobbyProps {
  camera: { stream: MediaStream | null; on: boolean; error: string; start: () => Promise<void>; stop: () => void };
  micMuted: boolean;
  onToggleMic: () => void;
  onJoin: () => void;
  /** Join with the inspector window open beside the call. */
  onJoinTest: () => void;
  /** Difficulty of each asker's follow-up questions, in ASKERS order. */
  difficulties: Difficulty[];
  onDifficulty: (asker: number, difficulty: Difficulty) => void;
  /** Interview length in minutes (one of INTERVIEW_LENGTHS). */
  lengthMin: number;
  onLength: (minutes: number) => void;
  /** Join is waiting for the LLM check. */
  checking: boolean;
  /** "I'm wearing headphones": the candidate may cut in while an interviewer speaks. */
  headphones: boolean;
  onHeadphones: (on: boolean) => void;
  /** Only an admin sees "Join in test mode". */
  role: Role;
  onRole: (role: Role) => void;
  /** Language, role, company and the three interviewers (shared/settings.ts). */
  settings: InterviewSettings;
  onSettings: (settings: InterviewSettings) => void;
}

type Step = 1 | 2 | 3;

const STEPS: { step: Step; name: string; note?: string }[] = [
  { step: 1, name: "Résumé", note: "optional" },
  { step: 2, name: "Interviewers" },
  { step: 3, name: "Settings" },
];

/**
 * The prep room (Yoodli style): three steps on the left (an optional résumé, the
 * interviewers, then difficulty and length), a Meet-style camera check and Join on
 * the right. Join works from any step: the settings always have valid defaults.
 */
export function Lobby({
  camera,
  micMuted,
  onToggleMic,
  onJoin,
  onJoinTest,
  difficulties,
  onDifficulty,
  lengthMin,
  onLength,
  checking,
  headphones,
  onHeadphones,
  role,
  onRole,
  settings,
  onSettings,
}: LobbyProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const card = useRef<HTMLElement>(null);
  const [step, setStep] = useState<Step>(1);
  const { start } = camera;
  // The background waves follow the microphone; muting it in the preview stops them reacting.
  const micLevel = useMicLevel(!micMuted);

  /** Switch step; if the card's top has scrolled out of view (phones), bring it back. */
  function goTo(next: Step) {
    setStep(next);
    const top = card.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) card.current?.scrollIntoView({ block: "start" });
  }

  useEffect(() => {
    void start();
  }, [start]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = camera.stream;
  }, [camera.stream]);

  return (
    <div className="lobby prep">
      <Waveform level={micLevel} />
      <header className="lobby-top">
        <a
          className="brand"
          href={HOME}
          onClick={(e) => {
            e.preventDefault();
            navigate(HOME);
          }}
        >
          <span className="brand-mark">H</span>
          <span className="brand-word">HotSeat</span>
        </a>
        <div className="lobby-top-right">
          <span className="lobby-tag">Higgs Audio Hackathon 2026</span>
          <UserMenu role={role} onRole={onRole} />
        </div>
      </header>

      <main className="lobby-main">
        <header className="prep-intro">
          <p className="eyebrow">
            <LiveBars />
            Prep room
          </p>
          <p className="prep-hint">
            Add your résumé if you like, choose your interviewers and settings, check your camera on the right, then
            join.
          </p>
        </header>

        <section ref={card} className="plan prep-card" aria-label="Prep steps">
          <ol className="steps">
            {STEPS.map(({ step: n, name, note }) => (
              <li key={n}>
                <button
                  className={`step-tab ${step === n ? "on" : ""} ${step > n ? "past" : ""}`}
                  aria-current={step === n ? "step" : undefined}
                  onClick={() => goTo(n)}
                >
                  <span className="step-num">{n}</span>
                  <span className="step-name">
                    {name}
                    {note && <small>{note}</small>}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          {step === 1 && <ResumeStep onNext={() => goTo(2)} />}
          {step === 2 && (
            <InterviewersStep
              settings={settings}
              onSettings={onSettings}
              onBack={() => goTo(1)}
              onNext={() => goTo(3)}
            />
          )}
          {step === 3 && (
            <SettingsStep
              settings={settings}
              difficulties={difficulties}
              onDifficulty={onDifficulty}
              lengthMin={lengthMin}
              onLength={onLength}
              onBack={() => goTo(2)}
            />
          )}
        </section>

        <section className="prejoin">
          <div className="preview">
            {camera.on ? (
              <video ref={videoRef} className="preview-video" autoPlay playsInline muted />
            ) : (
              <div className="preview-off">{camera.error ? "Camera unavailable" : "Camera is off"}</div>
            )}
            <div className="preview-controls">
              <button
                className={`round ${micMuted ? "off" : ""}`}
                onClick={onToggleMic}
                title={micMuted ? "Turn on microphone" : "Turn off microphone"}
              >
                <Icon name={micMuted ? "micOff" : "mic"} />
              </button>
              <button
                className={`round ${camera.on ? "" : "off"}`}
                onClick={() => (camera.on ? camera.stop() : void camera.start())}
                title={camera.on ? "Turn off camera" : "Turn on camera"}
              >
                <Icon name={camera.on ? "cam" : "camOff"} />
              </button>
            </div>
          </div>

          <div className="prejoin-side join-card">
            <h2>Ready to join?</h2>
            <p className="muted">The panel is waiting in the room.</p>
            <label className="headphones-switch">
              <input type="checkbox" checked={headphones} onChange={(e) => onHeadphones(e.target.checked)} />
              <span className="switch-track" aria-hidden="true" />
              <span className="switch-text">
                <strong>I'm wearing headphones</strong>
                <small>Lets you cut in while an interviewer is speaking</small>
              </span>
            </label>
            <button className="join" onClick={onJoin} disabled={checking}>
              {checking ? "Connecting…" : "Join interview"}
            </button>
            {role === "admin" && (
              <>
                <button className="test-join" onClick={onJoinTest} disabled={checking}>
                  <Icon name="bug" size={18} />
                  Join in test mode
                </button>
                <small className="test-hint">Admin only · also opens an inspector window</small>
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
