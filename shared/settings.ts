// One interview's settings from the prep room: language, the role and company the
// candidate practises for, and who sits on the panel (each seat's voice and the
// name it goes by). The browser sends them when the interview starts; the server
// keeps them on the interview row and only accepts voices on ALLOWED_VOICES.
import catalog from "./interviewer-voices.json";
import ownPortraits from "./portraits.json";
import { VOICES, type Speaker } from "./panel";
import { PEOPLE, type Person } from "./people";
import { DEFAULT_LANGUAGE, isLanguage, type Language } from "./languages";

export type Seat = Exclude<Speaker, "candidate">;

export const SEATS: Seat[] = ["moderator", "technical_lead", "mentor"];

/** A registered interviewer voice (shared/interviewer-voices.json; doc/interviewer-voices.zh.md). */
export interface CatalogVoice {
  id: string;
  /** What Higgs TTS and Realtime take as `voice`: "voice_…". */
  voice: string;
  name: string;
  gender: string;
  age: number;
  country: string;
  personality: string;
  description: string;
  refText: string;
  refAudio: string;
  avatar: { pr_hs: string; art_hs: string; pr_wu: string; art_wu: string };
}

export const VOICE_CATALOG = catalog as CatalogVoice[];

/**
 * The 20 catalog voices that suit an interview panel best, listed first in the voice
 * picker, in this order (2026-10-23, the user asked for 20). Chosen for a clear,
 * professional delivery: sharp or calm interviewers, academics and engineers, and warm
 * mentors; 10 men and 10 women from 11 countries or regions, mostly 30s–50s. Their fixed lines'
 * avatar videos are rendered ahead in English and Chinese (npm run avatar:lines -- --recommended).
 */
export const RECOMMENDED_VOICES = [
  "interviewer-v00", // The Probing Investigator, US, man, 40s
  "tech-bro-v05", // The Female AI Researcher, US, woman, 20s
  "host-interviewer-v00", // The Sharp Investigative Anchor, Canada, man, 40s
  "nerd-v06", // The Coding Bootcamp Mentor, Canada, woman, 30s
  "executive-v08", // The Toronto Pragmatist, Canada, man, 50s
  "patient-v05", // The Pragmatic Professional, England, woman, 40s
  "business-man-v00", // The Global Negotiator, England, man, 40s
  "fashionista-v04", // The London Editorial Voice, England, woman, 40s
  "intelligent-v05", // The Tokyo Engineer, Japan, man, 30s
  "spacey-v06", // The Quantum Lab Researcher, Japan, woman, 40s
  "business-man-v07", // The Singapore Fintech Lead, Singapore, man, 30s
  "banker-v01", // The Polished Singaporean Relationship Banker, Singapore, woman, 30s
  "measured-v09", // The Measured Science Communicator, New Zealand, man, 30s
  "intellectual-v05", // The Sharp-Witted Australian Academic, Australia, woman, 40s
  "knowledgeable-v02", // The Precise German Analyst, Germany, man, 50s
  "articulate-v05", // The Mumbai Scholar, India, woman, 30s
  "credible-v06", // The Trusted Science Educator, India, man, 30s
  "teacher-v01", // Mei Lin, China, woman, 20s
  "approachable-v06", // The Soft-Spoken Scottish Mentor, Scotland, man, 50s
  "business-woman-v06", // The Rising Operations Manager, US, woman, 20s
];

/** One of Higgs's six preset voices: no portrait or sample, unlike the catalog's. */
export interface PresetVoice {
  voice: string;
  /** The name a seat goes by when it takes this voice. */
  name: string;
  gender: "female" | "male";
  description: string;
}

/**
 * Higgs's preset voices (doc/boson-api-guide.zh.md), offered as "Default voices" beside
 * the catalog (2026-10-23). The default panel uses three of them (DEFAULT_SEATS).
 */
export const PRESET_VOICES: PresetVoice[] = [
  { voice: "chloe", name: "Chloe", gender: "female", description: "Friendly and clear" },
  { voice: "eleanor", name: "Eleanor", gender: "female", description: "Composed and professional" },
  { voice: "nora", name: "Nora", gender: "female", description: "Calm, a narrator's voice" },
  { voice: "jake", name: "Jake", gender: "male", description: "Energetic, a little dramatic" },
  { voice: "marcus", name: "Marcus", gender: "male", description: "Confident, a professor's tone" },
  { voice: "oliver", name: "Oliver", gender: "male", description: "Steady and thoughtful" },
];

/** One seat: the voice it speaks in and the name it goes by (spoken in the handoff line). */
export interface SeatChoice {
  voice: string;
  name: string;
}

export interface InterviewSettings {
  language: Language;
  /** The job the candidate practises for, e.g. "Software Engineer". */
  role: string;
  /** Free text, may be empty. */
  company: string;
  /**
   * How a TTS voice in this language should be given the company name so it says it
   * right: the company itself when it is already read right ("Google"), else a respelling
   * ("Nvidia" → "en-VID-ee-uh"). Inferred by the server when the interview is created
   * (server/pronounce.ts) and stored on the row; checkSettings drops one sent by the
   * browser. Absent when there is no company.
   */
  companySay?: string;
  seats: Record<Seat, SeatChoice>;
}

/** What the server inferred for the company name when the interview was created (POST /api/interviews). */
export interface CompanyPronunciation {
  company: string;
  say: string;
  ms: number;
  /** "llm": deepseek-flash's answer; "fallback": the name as typed, after a timeout or an error. */
  source: "llm" | "fallback";
  error?: string;
}

/** The roles the candidate can practise for: the Role box only offers these (2026-10-23). */
export const ROLES = [
  "Software Engineer",
  "Frontend Engineer",
  "Backend Engineer",
  "Full-Stack Engineer",
  "Mobile Engineer",
  "Machine Learning Engineer",
  "AI Engineer",
  "Data Scientist",
  "Data Engineer",
  "Data Analyst",
  "DevOps Engineer",
  "Site Reliability Engineer",
  "Cloud Engineer",
  "Security Engineer",
  "QA Engineer",
  "Embedded Software Engineer",
  "Hardware Engineer",
  "Robotics Engineer",
  "Research Scientist",
  "Research Engineer",
  "Quantitative Developer",
  "Game Developer",
  "Solutions Architect",
  "Systems Engineer",
  "Network Engineer",
  "Database Administrator",
  "Product Manager",
  "Technical Program Manager",
  "Engineering Manager",
  "UX Engineer",
] as const;

export const DEFAULT_ROLE = "Software Engineer";
export const DEFAULT_COMPANY = "";
const MAX_FIELD = 80;

/** The list's spelling of `role` (matched case-insensitively, ends trimmed); undefined if it is not on ROLES. */
export function roleOnList(role: string): string | undefined {
  const wanted = role.trim().toLowerCase();
  return ROLES.find((r) => r.toLowerCase() === wanted);
}

/** The default panel: Higgs's preset voices, named after them (Chloe, Oliver, Nora). */
export const DEFAULT_SEATS: Record<Seat, SeatChoice> = {
  moderator: { voice: VOICES.moderator, name: PEOPLE.moderator.name },
  technical_lead: { voice: VOICES.technical_lead, name: PEOPLE.technical_lead.name },
  mentor: { voice: VOICES.mentor, name: PEOPLE.mentor.name },
};

export const DEFAULT_SETTINGS: InterviewSettings = {
  language: DEFAULT_LANGUAGE,
  role: DEFAULT_ROLE,
  company: DEFAULT_COMPANY,
  seats: DEFAULT_SEATS,
};

/** The voices a seat may use: the 100 registered ones and Higgs's six presets. */
export const ALLOWED_VOICES: ReadonlySet<string> = new Set([
  ...VOICE_CATALOG.map((v) => v.voice),
  ...PRESET_VOICES.map((v) => v.voice),
]);

/**
 * Names are spoken aloud ("Oliver, over to you."), so only English letters, with single
 * spaces or hyphens between parts, at most NAME_MAX characters (2026-10-23: all
 * interviewers are assumed to have English names, whatever the interview language).
 */
export const NAME_MAX = 24;
const NAME = /^[A-Za-z]+(?:[ -][A-Za-z]+)*$/;
export const isValidName = (name: string) => name.length <= NAME_MAX && NAME.test(name);

const field = (value: unknown, fallback: string) =>
  typeof value === "string" ? value.trim().slice(0, MAX_FIELD) : fallback;

/**
 * Settings from the browser, checked: an error message, or the settings with the
 * role in the list's spelling and the company trimmed. The role must be on ROLES
 * (none given: DEFAULT_ROLE); every voice must be allowed, every name valid, and no
 * voice or name used by two seats. A `companySay` sent along is dropped: only the
 * server sets it.
 */
export function checkSettings(input: unknown): InterviewSettings | string {
  const x = (input ?? {}) as Partial<Record<keyof InterviewSettings, unknown>>;
  const language = x.language ?? DEFAULT_LANGUAGE;
  if (!isLanguage(language)) return `unknown language: ${String(language)}`;
  const role = x.role === undefined ? DEFAULT_ROLE : typeof x.role === "string" ? roleOnList(x.role) : undefined;
  if (!role) return `role not on the list: ${String(x.role)}`;
  const seats = {} as Record<Seat, SeatChoice>;
  for (const seat of SEATS) {
    const s = ((x.seats ?? {}) as Partial<Record<Seat, Partial<SeatChoice>>>)[seat] ?? DEFAULT_SEATS[seat];
    const voice = typeof s.voice === "string" ? s.voice : "";
    const name = typeof s.name === "string" ? s.name.trim() : "";
    if (!ALLOWED_VOICES.has(voice)) return `voice not allowed for ${seat}: ${voice}`;
    if (!isValidName(name)) return `invalid name for ${seat}: ${name}`;
    seats[seat] = { voice, name };
  }
  if (new Set(SEATS.map((s) => seats[s].voice)).size < SEATS.length) return "two seats use the same voice";
  if (new Set(SEATS.map((s) => seats[s].name.toLowerCase())).size < SEATS.length) return "two seats use the same name";
  return {
    language,
    role,
    company: field(x.company, DEFAULT_COMPANY),
    seats,
  };
}

/** PEOPLE with this interview's names; roles, colors and blurbs stay. */
export function peopleFor(settings: InterviewSettings): Record<Speaker, Person> {
  const out = { ...PEOPLE };
  for (const seat of SEATS) out[seat] = { ...PEOPLE[seat], name: settings.seats[seat].name };
  return out;
}

/**
 * Catalog voices (by id) with our own photo, public/portraits/<id>.jpg or .png, to its
 * file name: 4:3 landscape, seated at a computer facing the webcam, made for the 640 × 480
 * video (server/boson.ts AVATAR_SIZE). The catalog's own photos are 3:4 head-and-shoulders
 * shots. shared/portraits.json lists the folder; `npm run avatar:lines -- --portraits`
 * brings it up to date and renders the new photos' lines.
 */
const OWN_PORTRAITS = new Map((ownPortraits as string[]).map((file) => [file.replace(/\.\w+$/, ""), file]));

/**
 * The photo Higgs Avatar animates for a seat in `voice` (AVATAR=true): our own photo when
 * there is one (OWN_PORTRAITS, a path the browser loads and the server sends inline), else
 * the catalog voice's portrait (`pr_hs`). Undefined for a preset voice, which has none:
 * that seat stays voice only.
 */
export function portraitFor(voice: string): string | undefined {
  const v = VOICE_CATALOG.find((c) => c.voice === voice);
  return v && photoFor(v);
}

/** A catalog voice's photo: our own (OWN_PORTRAITS) if there is one, else the catalog's `pr_hs`. */
export function photoFor(v: CatalogVoice): string {
  const own = OWN_PORTRAITS.get(v.id);
  return own ? `${OWN_PORTRAIT_DIR}${own}` : v.avatar.pr_hs;
}

/** Where our own photos are served from (public/portraits/). */
export const OWN_PORTRAIT_DIR = "/portraits/";

/**
 * The silent listening loop a seat in `voice` plays while quiet (AVATAR=true): made from our
 * own photo by `npm run avatar:idle` (closed-mouth stretches only, a seamless loop). Undefined
 * without our own photo; a photo whose loop was not made yet fails to load and the tile keeps
 * the still photo.
 */
export function idleLoopFor(voice: string): string | undefined {
  const v = VOICE_CATALOG.find((c) => c.voice === voice);
  return v && OWN_PORTRAITS.has(v.id) ? `/idle/${v.id}.mp4` : undefined;
}

/** A short name for a voice in logs: a preset as is, a registered one by its catalog id (e.g. "educational-v08"). */
export function voiceLabel(voice: string): string {
  return VOICE_CATALOG.find((v) => v.voice === voice)?.id ?? voice;
}

/**
 * The preset Realtime falls back to when it refuses the moderator's voice: chloe, or
 * another preset if a TTS seat already speaks in chloe, so two seats never share a voice.
 */
export function fallbackVoice(settings: InterviewSettings): string {
  const taken = new Set(SEATS.filter((s) => s !== "moderator").map((s) => settings.seats[s].voice));
  return [VOICES.moderator, VOICES.mentor, VOICES.technical_lead].find((v) => !taken.has(v)) ?? VOICES.moderator;
}
