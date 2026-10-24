// The prep room's interviewer helpers: catalog lookups, the country groups the
// voice picker filters by, the first name a catalog voice gets by default, and
// the settings remembered in this browser.
import {
  DEFAULT_SEATS,
  DEFAULT_SETTINGS,
  SEATS,
  PRESET_VOICES,
  VOICE_CATALOG,
  checkSettings,
  isValidName,
  type CatalogVoice,
  type InterviewSettings,
  type PresetVoice,
  type Seat,
} from "../../shared/settings";
import { languageOr } from "../../shared/languages";

const BY_VOICE = new Map(VOICE_CATALOG.map((v) => [v.voice, v]));

/** The catalog entry for a seat's voice; undefined for Higgs's preset voices (chloe, oliver, nora, …). */
export const catalogVoice = (voice: string): CatalogVoice | undefined => BY_VOICE.get(voice);

/** Higgs's preset voice a seat speaks in; undefined for a catalog voice. */
export const presetVoice = (voice: string): PresetVoice | undefined => PRESET_VOICES.find((p) => p.voice === voice);

export const PERSONALITIES = ["calm", "upbeat", "sharp", "warm"] as const;

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "30s" for the catalog's age 30 (an age band: "in her early 30s"). */
export const ageBand = (age: number) => `${age}s`;

/** The 27 countries or regions in the catalog, grouped as in doc/interviewer-voices.zh.md. */
export const REGIONS: { name: string; countries: string[] }[] = [
  { name: "North America", countries: ["United States", "Canada"] },
  {
    name: "UK and Ireland",
    countries: ["United Kingdom (England)", "United Kingdom (Scotland)", "Ireland"],
  },
  { name: "Oceania", countries: ["Australia", "New Zealand"] },
  { name: "South and Southeast Asia", countries: ["India", "Singapore", "Philippines"] },
  { name: "East Asia", countries: ["Japan", "South Korea", "China"] },
  { name: "Africa and the Caribbean", countries: ["Nigeria", "Kenya", "South Africa", "Jamaica"] },
  {
    name: "Continental Europe",
    countries: ["France", "Germany", "Italy", "Spain", "Nordic countries", "Eastern Europe", "Russia"],
  },
  { name: "Latin America", countries: ["Latin America", "Brazil"] },
  { name: "Middle East and North Africa", countries: ["Middle East & North Africa"] },
];

// Catalog names are titles ("The Calm Helpdesk"), not names to be called by, so a
// voice gets a common English first name picked from its id. The six preset voices'
// names (Chloe, Eleanor, Nora, Jake, Marcus, Oliver) are left out.
const FIRST_NAMES: Record<"female" | "male", string[]> = {
  female: [
    "Ava",
    "Emma",
    "Grace",
    "Hannah",
    "Julia",
    "Laura",
    "Lily",
    "Maya",
    "Olivia",
    "Rachel",
    "Sarah",
    "Sophie",
    "Zoe",
    "Claire",
    "Anna",
    "Ella",
    "Leah",
    "Ruby",
    "Isla",
    "Megan",
  ],
  male: [
    "Adam",
    "Ben",
    "Daniel",
    "David",
    "Ethan",
    "Henry",
    "Jack",
    "James",
    "Leo",
    "Lucas",
    "Mark",
    "Max",
    "Noah",
    "Owen",
    "Ryan",
    "Sam",
    "Thomas",
    "Victor",
    "Will",
    "Peter",
  ],
};

/** A small stable hash (FNV-1a), so the same voice always gets the same name. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * The name a catalog voice goes by when picked: the person name in its title if it
 * has one ("Sofia - The Clear Spanish Lecturer"), else a first name chosen from its
 * id and gender. `taken` (other seats' names) are skipped: the next name in the list.
 */
export function defaultNameFor(voice: CatalogVoice, taken: string[]): string {
  const used = new Set(taken.map((n) => n.toLowerCase()));
  const free = (name: string) => isValidName(name) && !used.has(name.toLowerCase());
  const titled = voice.name.split(" - ")[0].trim();
  if (voice.name.includes(" - ") && free(titled)) return titled;
  const list = FIRST_NAMES[voice.gender === "male" ? "male" : "female"];
  const start = hash(voice.id) % list.length;
  for (let i = 0; i < list.length; i++) {
    const name = list[(start + i) % list.length];
    if (free(name)) return name;
  }
  return list[start];
}

/** Initials for an avatar without a picture: "Mei Lin" -> "ML", "Chloe" -> "C". */
export const initials = (name: string) =>
  name
    .split(/[ -]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

export const otherSeats = (seat: Seat) => SEATS.filter((s) => s !== seat);

// Language stays under its own key (hotseat.language, read by test scripts too);
// role, company and the seats are kept under SETTINGS_KEY.
const SETTINGS_KEY = "hotseat.settings";
const LANGUAGE_KEY = "hotseat.language";

/**
 * The settings from last time in this browser, checked part by part: a seat that is not
 * valid (or clashes with an earlier seat) goes back to its default, and so do a bad
 * role or company, while the rest is kept. Until 2026-10-23 one bad seat reset everything.
 */
export function savedSettings(): InterviewSettings {
  let saved: Partial<InterviewSettings> | null = null;
  let language = DEFAULT_SETTINGS.language;
  try {
    saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as Partial<InterviewSettings> | null;
    language = languageOr(localStorage.getItem(LANGUAGE_KEY));
  } catch {
    // Storage blocked or bad JSON: the defaults.
  }
  let settings: InterviewSettings = { ...DEFAULT_SETTINGS, language, seats: { ...DEFAULT_SEATS } };
  const tryWith = (next: InterviewSettings) => {
    const checked = checkSettings(next);
    if (typeof checked !== "string") settings = checked;
  };
  tryWith({ ...settings, role: saved?.role ?? settings.role });
  tryWith({ ...settings, company: saved?.company ?? settings.company });
  for (const seat of SEATS) {
    const choice = saved?.seats?.[seat];
    if (choice) tryWith({ ...settings, seats: { ...settings.seats, [seat]: choice } });
  }
  return settings;
}

export function saveSettings(settings: InterviewSettings): void {
  try {
    const { language, role, company, seats } = settings;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ role, company, seats }));
    localStorage.setItem(LANGUAGE_KEY, language);
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
}
