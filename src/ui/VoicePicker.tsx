import { useEffect, useMemo, useState } from "react";
import { LABELS } from "../../shared/panel";
import {
  DEFAULT_SEATS,
  PRESET_VOICES,
  RECOMMENDED_VOICES,
  VOICE_CATALOG,
  photoFor,
  type CatalogVoice,
  type InterviewSettings,
  type PresetVoice,
  type Seat,
} from "../../shared/settings";
import { Icon } from "./icons";
import { Modal } from "./Modal";
import { VoiceAvatar } from "./VoiceAvatar";
import { PERSONALITIES, REGIONS, ageBand, capitalize, otherSeats } from "./interviewers";
import { stopSample, toggleSample, usePlayingSample } from "./useSample";

interface VoicePickerProps {
  seat: Seat;
  settings: InterviewSettings;
  onPick: (voice: CatalogVoice) => void;
  /** One of Higgs's six preset voices ("Default voices"). */
  onPickPreset: (voice: PresetVoice) => void;
  /** Back to the seat's Higgs preset voice under its default name. */
  onDefault: () => void;
  onClose: () => void;
}

type Gender = "" | "female" | "male";

/**
 * Higgs's six preset voices ("Default voices", no portrait) and the 100 catalog voices as
 * cards, with filters that combine (personality, gender, place, search). The presets have
 * no personality or country, so those two filters hide them.
 */
export function VoicePicker({ seat, settings, onPick, onPickPreset, onDefault, onClose }: VoicePickerProps) {
  const [personality, setPersonality] = useState("");
  const [gender, setGender] = useState<Gender>("");
  /** "" (anywhere), "region:<name>" or "country:<name>". */
  const [place, setPlace] = useState("");
  const [query, setQuery] = useState("");
  const playing = usePlayingSample();

  // Stop a sample when the picker closes.
  useEffect(() => () => stopSample(), []);

  /** Voices other seats use, with who uses them: these cannot be picked. */
  const taken = useMemo(() => {
    const out = new Map<string, string>();
    for (const s of otherSeats(seat)) out.set(settings.seats[s].voice, settings.seats[s].name);
    return out;
  }, [seat, settings]);

  const current = settings.seats[seat].voice;
  const preset = DEFAULT_SEATS[seat];

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const region = place.startsWith("region:") ? REGIONS.find((r) => r.name === place.slice(7)) : undefined;
    return VOICE_CATALOG.filter(
      (v) =>
        (!personality || v.personality === personality) &&
        (!gender || v.gender === gender) &&
        (!place || (region ? region.countries.includes(v.country) : place === `country:${v.country}`)) &&
        (!q || v.name.toLowerCase().includes(q) || v.description.toLowerCase().includes(q)),
    );
  }, [personality, gender, place, query]);

  const presets = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (personality || place) return [];
    return PRESET_VOICES.filter(
      (v) =>
        (!gender || v.gender === gender) &&
        (!q || v.name.toLowerCase().includes(q) || v.description.toLowerCase().includes(q)),
    );
  }, [personality, gender, place, query]);
  const count = shown.length + presets.length;
  // The 20 recommended voices first (above the presets, 2026-10-23), in their order, then the rest as listed.
  const recommended = RECOMMENDED_VOICES.flatMap((id) => shown.filter((v) => v.id === id));
  const others = shown.filter((v) => !RECOMMENDED_VOICES.includes(v.id));

  /** How many filters are set (the search counts as one). */
  const active = [personality, gender, place, query.trim()].filter(Boolean).length;
  const clear = () => {
    setPersonality("");
    setGender("");
    setPlace("");
    setQuery("");
  };

  /** A catalog voice's card: portrait, name, where from, a sample and its personality. */
  const card = (v: CatalogVoice) => {
    const user = taken.get(v.voice);
    const mine = v.voice === current;
    const on = playing === v.id;
    return (
      <li key={v.id} className={`voice-card ${mine ? "current" : ""} ${user ? "taken" : ""}`}>
        <button
          className="voice-pick"
          disabled={user !== undefined}
          aria-pressed={mine}
          onClick={() => onPick(v)}
          title={v.description}
        >
          <VoiceAvatar key={v.id} className="voice-avatar" src={photoFor(v)} name={v.name} />
          <span className="voice-text">
            <strong>{v.name}</strong>
            <small>{v.country}</small>
            <small>
              {capitalize(v.gender)} · {ageBand(v.age)}
            </small>
            <span className={`tag p-${v.personality}`}>{v.personality}</span>
          </span>
          {user !== undefined && <span className="voice-badge">With {user}</span>}
          {mine && <span className="voice-badge on">Current</span>}
        </button>
        <button
          className={`play-btn ${on ? "on" : ""}`}
          aria-label={on ? `Stop the sample of ${v.name}` : `Play a sample of ${v.name}`}
          title={on ? "Stop" : "Play a sample"}
          onClick={() => toggleSample(v.id, v.refAudio)}
        >
          <Icon name={on ? "stop" : "play"} size={18} />
        </button>
      </li>
    );
  };

  return (
    <Modal
      title={`Choose a voice for the ${LABELS[seat]}`}
      subtitle={`Now: ${settings.seats[seat].name}. Play a sample, then pick a card.`}
      onClose={onClose}
      className="voice-dialog"
    >
      <div className="voice-filters">
        {/* The search, and at its right one button that clears every filter (2026-10-23, the user's request). */}
        <div className="filter-top">
          <label className="search-box">
            <Icon name="search" size={18} />
            <input
              type="search"
              value={query}
              placeholder="Search names and descriptions"
              aria-label="Search voices by name or description"
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <button
            className="clear-filters"
            onClick={clear}
            disabled={active === 0}
            aria-label={active ? `Clear all ${active} filters` : "No filters to clear"}
          >
            <Icon name="undo" size={16} />
            Clear all
            {active > 0 && <span className="clear-count">{active}</span>}
          </button>
        </div>
        <div className="filter-row">
          <div className="chips" role="radiogroup" aria-label="Personality">
            {["", ...PERSONALITIES].map((p) => (
              <button
                key={p || "all"}
                role="radio"
                aria-checked={personality === p}
                className={`chip ${personality === p ? "on" : ""}`}
                onClick={() => setPersonality(p)}
              >
                {p ? <span className={`dot p-${p}`} aria-hidden="true" /> : null}
                {p ? capitalize(p) : "Any personality"}
              </button>
            ))}
          </div>
          <div className="segmented" role="radiogroup" aria-label="Gender">
            {(["", "female", "male"] as Gender[]).map((g) => (
              <button
                key={g || "any"}
                role="radio"
                aria-checked={gender === g}
                className={gender === g ? "on" : ""}
                onClick={() => setGender(g)}
              >
                {g ? capitalize(g) : "Any"}
              </button>
            ))}
          </div>
          <select
            className="select"
            value={place}
            aria-label="Country or region"
            onChange={(e) => setPlace(e.target.value)}
          >
            <option value="">Any country or region</option>
            {REGIONS.map((r) => (
              <optgroup key={r.name} label={r.name}>
                <option value={`region:${r.name}`}>All of {r.name}</option>
                {r.countries.map((c) => (
                  <option key={c} value={`country:${c}`}>
                    {c}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="voice-count">
          <span aria-live="polite">
            {count} {count === 1 ? "voice" : "voices"}
          </span>
          <button className="small-btn default-voice" onClick={onDefault} disabled={current === preset.voice}>
            <Icon name="refresh" size={16} />
            {current === preset.voice
              ? `Using the default voice (${preset.name})`
              : `Use the default voice (${preset.name})`}
          </button>
        </div>
      </div>

      <ul className="voice-grid">
        {recommended.length > 0 && (
          <li className="voice-group">
            <strong>Recommended</strong>
            <span>Picked for an interview panel, 10 men and 10 women. They appear on camera in the interview.</span>
          </li>
        )}
        {recommended.map(card)}
        {presets.length > 0 && (
          <li className="voice-group">
            <strong>Default voices</strong>
            <span>Higgs&apos;s built-in voices. They have no portrait or sample: the card shows an initial.</span>
          </li>
        )}
        {presets.map((v) => {
          const user = taken.get(v.voice);
          const mine = v.voice === current;
          return (
            <li key={v.voice} className={`voice-card preset ${mine ? "current" : ""} ${user ? "taken" : ""}`}>
              <button
                className="voice-pick"
                disabled={user !== undefined}
                aria-pressed={mine}
                onClick={() => onPickPreset(v)}
                title={v.description}
              >
                <VoiceAvatar className="voice-avatar" name={v.name} />
                <span className="voice-text">
                  <strong>{v.name}</strong>
                  <small>{v.description}</small>
                  <small>{capitalize(v.gender)}</small>
                  <span className="tag no-portrait">No portrait</span>
                </span>
                {user !== undefined && <span className="voice-badge">With {user}</span>}
                {mine && <span className="voice-badge on">Current</span>}
              </button>
            </li>
          );
        })}
        {others.length > 0 && (presets.length > 0 || recommended.length > 0) && (
          <li className="voice-group">
            <strong>More voices</strong>
            <span>With a portrait and a sample to play.</span>
          </li>
        )}
        {others.map(card)}
      </ul>
      {count === 0 && (
        <p className="voice-empty muted">
          No voice matches these filters.{" "}
          <button className="link-btn" onClick={clear}>
            Clear filters
          </button>
        </p>
      )}
    </Modal>
  );
}
