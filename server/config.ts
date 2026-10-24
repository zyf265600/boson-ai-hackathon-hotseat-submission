// Product vs test behavior, switched by TEST in .env. Not the same thing as
// "test mode" in the lobby (simulated candidate + inspector window).
// TEST=true: our own development, testing and rehearsals. Cheap, fixed
//   settings, e.g. the Orchestrator uses DeepSeek only.
// TEST unset or false: the real product, and the live presentation. Redundancy
//   that costs more, e.g. LLM fallbacks. A feature that should behave
//   differently in the two settings checks TEST here instead of adding its own switch.
export const TEST = flag("TEST");

// AVATAR=true: the two TTS panelists speak as Higgs Avatar talking heads (from Junwei's
// PR #4, part 2 of the plan). Unset, they are voices only. A feature switch, not a
// TEST-vs-product difference.
export const AVATAR = flag("AVATAR");

function flag(name: string): boolean {
  return /^(1|true|yes)$/i.test(process.env[name]?.trim() ?? "");
}
