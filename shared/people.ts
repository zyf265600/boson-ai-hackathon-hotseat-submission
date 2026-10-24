import { LABELS, VOICES, type Speaker } from "./panel";

export interface Person {
  name: string;
  role: string;
  /** Avatar background; the speaking ring uses the shared accent. */
  color: string;
  blurb: string;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Names follow the TTS / Realtime voice, so changing a voice in panel.ts renames the seat.
export const PEOPLE: Record<Speaker, Person> = {
  moderator: {
    name: capitalize(VOICES.moderator),
    role: LABELS.moderator,
    color: "#3563c9",
    blurb: "Runs the room and steps in when you interrupt.",
  },
  technical_lead: {
    name: capitalize(VOICES.technical_lead),
    role: LABELS.technical_lead,
    color: "#1f8466",
    blurb: "Digs into your architecture and pushes back on assumptions.",
  },
  mentor: {
    name: capitalize(VOICES.mentor),
    role: LABELS.mentor,
    color: "#1d7487",
    blurb: "Follows up on the parts of your project not covered yet.",
  },
  candidate: {
    name: "You",
    role: "Candidate",
    color: "#6b7a8c",
    blurb: "",
  },
};

/** Grid order in the call: you sit with the panel, like a Meet tile grid. */
export const TILE_ORDER: Speaker[] = ["moderator", "technical_lead", "mentor", "candidate"];
