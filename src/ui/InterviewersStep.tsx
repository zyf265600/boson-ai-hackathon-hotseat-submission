import { useEffect, useState } from "react";
import { LABELS } from "../../shared/panel";
import { PEOPLE } from "../../shared/people";
import { LANGUAGES } from "../../shared/languages";
import {
  DEFAULT_COMPANY,
  DEFAULT_SEATS,
  NAME_MAX,
  SEATS,
  isValidName,
  photoFor,
  type CatalogVoice,
  type InterviewSettings,
  type PresetVoice,
  type Seat,
} from "../../shared/settings";
import { Icon } from "./icons";
import { LanguagePanel } from "./LanguagePanel";
import { RoleCombobox } from "./RoleCombobox";
import { VoicePicker } from "./VoicePicker";
import { capitalize, catalogVoice, defaultNameFor, otherSeats } from "./interviewers";
import { VoiceAvatar } from "./VoiceAvatar";
import { stopSample, toggleSample, usePlayingSample } from "./useSample";

interface InterviewersStepProps {
  settings: InterviewSettings;
  onSettings: (settings: InterviewSettings) => void;
  onBack: () => void;
  onNext: () => void;
}

/** Step 2 of the prep room: the job, the language and who sits on the panel (step 3, SettingsStep, sets how hard and long). */
export function InterviewersStep({ settings, onSettings, onBack, onNext }: InterviewersStepProps) {
  const [picking, setPicking] = useState<Seat | null>(null);
  const [choosingLanguage, setChoosingLanguage] = useState(false);

  // Leaving the step stops a card's sample.
  useEffect(() => () => stopSample(), []);

  const setSeat = (seat: Seat, voice: string, name: string) =>
    onSettings({ ...settings, seats: { ...settings.seats, [seat]: { voice, name } } });

  function pick(seat: Seat, voice: CatalogVoice) {
    const taken = otherSeats(seat).map((s) => settings.seats[s].name);
    setSeat(seat, voice.voice, defaultNameFor(voice, taken));
    setPicking(null);
  }

  /** A preset voice: its own name ("Eleanor"), unless another seat goes by it already. */
  function pickPreset(seat: Seat, voice: PresetVoice) {
    const taken = otherSeats(seat).map((s) => settings.seats[s].name.toLowerCase());
    setSeat(seat, voice.voice, taken.includes(voice.name.toLowerCase()) ? settings.seats[seat].name : voice.name);
    setPicking(null);
  }

  function resetVoice(seat: Seat) {
    const preset = DEFAULT_SEATS[seat];
    // Another seat may have taken the preset's name: keep a free name then.
    const taken = otherSeats(seat).map((s) => settings.seats[s].name.toLowerCase());
    const name = taken.includes(preset.name.toLowerCase()) ? settings.seats[seat].name : preset.name;
    setSeat(seat, preset.voice, name);
    setPicking(null);
  }

  return (
    <div className="step-body">
      <section className="prep-section" aria-labelledby="job-title">
        <h3 id="job-title">The job</h3>
        <div className="field-pair">
          <RoleCombobox value={settings.role} onChange={(role) => onSettings({ ...settings, role })} />
          <TextField
            id="prep-company"
            label="Company"
            value={settings.company}
            fallback={DEFAULT_COMPANY}
            placeholder="Optional"
            onChange={(company) => onSettings({ ...settings, company })}
          />
          {/* A full-width field like Role and Company, so the three line up (2026-10-23). */}
          <div className="field wide">
            <span className="field-label" id="language-label">
              Interview language
            </span>
            <button
              className="language-btn"
              aria-labelledby="language-label language-current"
              onClick={() => setChoosingLanguage(true)}
            >
              <Icon name="globe" size={18} />
              <span id="language-current">{LANGUAGES[settings.language].label}</span>
              <Icon name="expandMore" size={18} />
            </button>
          </div>
        </div>
      </section>

      <section className="prep-section" aria-labelledby="panel-title">
        <h3 id="panel-title">Your interviewers</h3>
        <p className="muted section-note">
          Rename anyone, or change a voice to hear a different interviewer. Names are spoken aloud, so use English
          letters.
        </p>
        <ul className="seat-list">
          {SEATS.map((seat) => (
            <SeatCard
              key={seat}
              seat={seat}
              settings={settings}
              onName={(name) => setSeat(seat, settings.seats[seat].voice, name)}
              onChange={() => setPicking(seat)}
              onReset={() => resetVoice(seat)}
            />
          ))}
        </ul>
      </section>

      <footer className="step-nav">
        <button className="small-btn" onClick={onBack}>
          <Icon name="chevronLeft" size={18} />
          Back
        </button>
        <button className="step-next" onClick={onNext}>
          Next
          <Icon name="chevronRight" size={18} />
        </button>
      </footer>

      {picking && (
        <VoicePicker
          seat={picking}
          settings={settings}
          onPick={(v) => pick(picking, v)}
          onPickPreset={(v) => pickPreset(picking, v)}
          onDefault={() => resetVoice(picking)}
          onClose={() => setPicking(null)}
        />
      )}
      {choosingLanguage && (
        <LanguagePanel
          language={settings.language}
          onPick={(language) => {
            onSettings({ ...settings, language });
            setChoosingLanguage(false);
          }}
          onClose={() => setChoosingLanguage(false)}
        />
      )}
    </div>
  );
}

/** A text field with a small reset-to-default button inside it (the Company box; free text). */
function TextField({
  id,
  label,
  value,
  fallback,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  fallback: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="field-box">
        <input
          id={id}
          className="text-input"
          value={value}
          maxLength={80}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          className="reset-btn"
          onClick={() => onChange(fallback)}
          disabled={value === fallback}
          aria-label={`Reset ${label.toLowerCase()} to ${fallback ? `"${fallback}"` : "empty"}`}
          title={fallback ? `Reset to "${fallback}"` : "Clear"}
        >
          <Icon name="refresh" size={16} />
        </button>
      </div>
    </div>
  );
}

/** The seat's portrait (ours if we made one), or its initials on the seat's color for a preset voice. */
export function SeatAvatar({ seat, settings, small }: { seat: Seat; settings: InterviewSettings; small?: boolean }) {
  const { voice, name } = settings.seats[seat];
  const v = catalogVoice(voice);
  return (
    <VoiceAvatar
      key={voice}
      className={`seat-avatar ${small ? "small" : ""}`}
      src={v && photoFor(v)}
      name={name}
      color={PEOPLE[seat].color}
    />
  );
}

/**
 * One seat: portrait, editable name, role, where the voice is from, a sample and "Change";
 * an undo arrow in the top-right corner puts the seat back to its preset voice and name.
 */
function SeatCard({
  seat,
  settings,
  onName,
  onChange,
  onReset,
}: {
  seat: Seat;
  settings: InterviewSettings;
  onName: (name: string) => void;
  onChange: () => void;
  onReset: () => void;
}) {
  const { voice, name } = settings.seats[seat];
  const preset = DEFAULT_SEATS[seat];
  const isPreset = voice === preset.voice && name === preset.name;
  const v = catalogVoice(voice);
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState("");
  const playing = usePlayingSample();
  const on = v !== undefined && playing === v.id;

  // A new voice comes with a new name: show it (but keep a trailing space being typed).
  useEffect(() => {
    setDraft((d) => (d.trim() === name ? d : name));
    setError("");
  }, [name]);

  function edit(text: string) {
    setDraft(text);
    const trimmed = text.trim();
    const others = otherSeats(seat).map((s) => settings.seats[s].name.toLowerCase());
    if (!trimmed) setError("Enter a name.");
    else if (!isValidName(trimmed))
      setError(`English letters only, with single spaces or hyphens between parts, up to ${NAME_MAX} characters.`);
    else if (others.includes(trimmed.toLowerCase())) setError("Another interviewer already has this name.");
    else {
      setError("");
      if (trimmed !== name) onName(trimmed);
    }
  }

  const inputId = `seat-name-${seat}`;
  return (
    <li className="seat-card">
      {/* Undoes this seat's choices (2026-10-23, the user's request); hidden while it is the preset. */}
      {!isPreset && (
        <button
          className="seat-reset"
          onClick={onReset}
          aria-label={`Reset the ${LABELS[seat]} to ${preset.name}, the default voice`}
          title={`Reset to ${preset.name} (default)`}
        >
          <Icon name="undo" size={15} />
        </button>
      )}
      <SeatAvatar seat={seat} settings={settings} />
      <div className="seat-main">
        <div className="seat-name-row">
          <label className="sr-only" htmlFor={inputId}>
            {LABELS[seat]}'s name
          </label>
          {/* As wide as the name, so the pencil sits right after it: a hidden copy of the text sizes the box. */}
          <span className="seat-name-size" data-value={draft}>
            <input
              id={inputId}
              className={`seat-name ${error ? "invalid" : ""}`}
              value={draft}
              maxLength={NAME_MAX + 8}
              size={1}
              spellCheck={false}
              aria-invalid={error !== ""}
              aria-describedby={error ? `${inputId}-error` : undefined}
              onChange={(e) => edit(e.target.value)}
              // Leaving an invalid name puts the last valid one back.
              onBlur={() => {
                setDraft(name);
                setError("");
              }}
            />
          </span>
          <Icon name="edit" size={14} />
          <span className="seat-role">{LABELS[seat]}</span>
        </div>
        <div className="seat-meta">
          {v ? (
            <>
              <span className="seat-voice" title={v.description}>
                {v.name}
              </span>
              <span>{v.country}</span>
              <span className={`tag p-${v.personality}`}>{v.personality}</span>
            </>
          ) : (
            <span>Default voice · {capitalize(voice)} · no portrait</span>
          )}
        </div>
        {error && (
          <small className="field-error" id={`${inputId}-error`} role="alert">
            {error} Keeping "{name}".
          </small>
        )}
      </div>
      <div className="seat-actions">
        {v && (
          <button
            className={`play-btn ${on ? "on" : ""}`}
            aria-label={on ? `Stop the sample of ${name}'s voice` : `Play a sample of ${name}'s voice`}
            title={on ? "Stop" : "Play a sample"}
            onClick={() => toggleSample(v.id, v.refAudio)}
          >
            <Icon name={on ? "stop" : "play"} size={18} />
          </button>
        )}
        <button className="small-btn" onClick={onChange} aria-label={`Change ${LABELS[seat]}'s voice`}>
          Change
        </button>
      </div>
    </li>
  );
}
