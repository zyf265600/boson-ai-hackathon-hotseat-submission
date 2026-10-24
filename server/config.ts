// Product vs test behavior, switched by TEST in .env. Not the same thing as
// "test mode" in the lobby (simulated candidate + inspector window).
// TEST=true: our own development, testing and rehearsals: the server keeps copies of the
//   panel's audio and avatar videos under logs/ to check later.
// TEST unset or false: the real product, and the live presentation.
// Which LLMs the Orchestrator may use is BACKUP's job, not TEST's (2026-10-24).
export const TEST = flag("TEST");

// BACKUP=true: before each interview the server tries the LLMs in LLM_ORDER (DeepSeek,
// OpenAI, Claude, Gemini) and uses the first that answers, so the interview still runs
// when DeepSeek is down. Unset or false: DeepSeek only, no fallback (2026-10-24, the
// user's request: until then TEST=false turned the fallback on).
export const BACKUP = flag("BACKUP");

// AVATAR=true: the two TTS panelists speak as Higgs Avatar talking heads (from Junwei's
// PR #4, part 2 of the plan). Unset, they are voices only. A feature switch, not a
// TEST-vs-product difference.
export const AVATAR = flag("AVATAR");

function flag(name: string): boolean {
  return /^(1|true|yes)$/i.test(process.env[name]?.trim() ?? "");
}
