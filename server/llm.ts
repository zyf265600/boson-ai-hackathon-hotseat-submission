import Anthropic from "@anthropic-ai/sdk";
import type { QuestionMode } from "../shared/questions";
import { TEST } from "./config";

type ProviderId = "deepseek" | "openai" | "claude" | "gemini";

interface Provider {
  id: ProviderId;
  /** The .env variable that holds this provider's key. */
  keyVar: string;
  model: string;
  /** A faster model of the same provider, for calls that ask for speed (chatJson `quick`). */
  quickModel?: string;
  /** One JSON-mode chat call to `model`; resolves with the reply's text. */
  call(
    key: string,
    model: string,
    system: string,
    user: string,
    mode: QuestionMode,
    maxTokens: number,
  ): Promise<string>;
}

const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
/** Deep mode's reasoning effort: low | high | max; unset uses DeepSeek's default (high). */
const DEEPSEEK_REASONING_EFFORT = process.env.DEEPSEEK_REASONING_EFFORT?.trim();

/** The fastest DeepSeek model, for small yes/no calls such as turn detection, and the report. */
const QUICK_MODEL = "deepseek-flash";

/** POST an OpenAI-style chat completion and return the reply's text. */
async function chatCompletion(
  name: string,
  url: string,
  key: string,
  body: object,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`${name} ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { choices: { message: { content: string | null } }[] };
  return data.choices[0]?.message?.content ?? "";
}

function messages(system: string, user: string) {
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

// OpenAI, Claude and Gemini cannot fully switch reasoning off, so "fast" means
// their lowest effort, and their token budget leaves room for that reasoning.
const REASONING_ROOM = 2000;

const PROVIDERS: Record<ProviderId, Provider> = {
  deepseek: {
    id: "deepseek",
    keyVar: "DEEPSEEK_API_KEY",
    model: process.env.DEEPSEEK_MODEL ?? "deepseek-flash",
    quickModel: QUICK_MODEL,
    call(key, model, system, user, mode, maxTokens) {
      return chatCompletion("DeepSeek", `${DEEPSEEK_BASE_URL}/chat/completions`, key, {
        model,
        messages: messages(system, user),
        response_format: { type: "json_object" },
        thinking: { type: mode === "deep" ? "enabled" : "disabled" },
        ...(mode === "deep" && DEEPSEEK_REASONING_EFFORT ? { reasoning_effort: DEEPSEEK_REASONING_EFFORT } : {}),
        // In thinking mode the budget also covers the reasoning tokens.
        max_tokens: maxTokens,
      });
    },
  },
  openai: {
    id: "openai",
    keyVar: "OPENAI_API_KEY",
    model: process.env.OPENAI_MODEL ?? "gpt-6.1-sol",
    call(key, model, system, user, mode, maxTokens) {
      return chatCompletion("OpenAI", "https://api.openai.com/v1/chat/completions", key, {
        model,
        messages: messages(system, user),
        response_format: { type: "json_object" },
        reasoning_effort: mode === "deep" ? "medium" : "low",
        // Reasoning models take max_completion_tokens; it also covers the reasoning.
        max_completion_tokens: maxTokens + REASONING_ROOM,
      });
    },
  },
  claude: {
    id: "claude",
    keyVar: "ANTHROPIC_API_KEY",
    model: process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5",
    async call(key, model, system, user, mode, maxTokens) {
      const client = new Anthropic({ apiKey: key });
      const message = await client.beta.messages.create({
        model,
        max_tokens: maxTokens + REASONING_ROOM,
        // Claude has no JSON mode and sometimes drafts, critiques and redrafts in the reply.
        system: `${system}\nOutput only the final JSON object, with no drafts or commentary.`,
        messages: [{ role: "user", content: user }],
        // Thinking cannot be disabled on Opus 5.5; effort sets how much it thinks.
        output_config: { effort: mode === "deep" ? "medium" : "low" },
        // If a safety classifier declines, the API retries on a fallback model in the same call.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
      if (message.stop_reason === "refusal") throw new Error("Claude refused the request");
      return message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    },
  },
  gemini: {
    id: "gemini",
    keyVar: "GEMINI_API_KEY",
    model: process.env.GEMINI_MODEL ?? "gemini-3.8-flash",
    call(key, model, system, user, mode, maxTokens) {
      // Gemini's OpenAI-compatible endpoint maps reasoning_effort to its thinking level.
      return chatCompletion("Gemini", "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", key, {
        model,
        messages: messages(system, user),
        response_format: { type: "json_object" },
        reasoning_effort: mode === "deep" ? "high" : "low",
        max_tokens: maxTokens + REASONING_ROOM,
      });
    },
  },
};

/**
 * Fallback order; LLM_ORDER in .env overrides it, e.g. "claude,deepseek".
 * TEST=true locks the Orchestrator to DeepSeek: no fallback, lowest cost.
 */
const ORDER: ProviderId[] = (TEST ? "deepseek" : (process.env.LLM_ORDER ?? "deepseek,openai,claude,gemini"))
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter((s): s is ProviderId => s in PROVIDERS);

const keyOf = (p: Provider) => process.env[p.keyVar]?.trim();

/** The provider every call uses; picked by checkProviders() before each interview. */
let active: Provider | undefined;
/** When `active` last passed a check. */
let checkedAt = 0;
/** Why each provider failed in the last check, e.g. "deepseek (deepseek-v4-pro): DeepSeek 401: …". */
let lastErrors: string[] = [];
/** The check still running, if any: calls wait for it instead of guessing. */
let checking: Promise<boolean> | undefined;

/** A test call longer than this counts as a failure. */
const CHECK_TIMEOUT_MS = 8000;
/**
 * A passed check is reused for this long, so Join, which re-checks after the
 * lobby already did, starts at once. A failed check is never reused.
 */
const CHECK_REUSE_MS = 60_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms),
  );
  return Promise.race([promise, timeout]);
}

/**
 * Try the providers in order with a tiny JSON call and make the first that
 * answers the active one; resolves false when none works. Runs before each
 * interview; the interview itself never switches providers.
 */
export function checkProviders(): Promise<boolean> {
  if (checking) return checking;
  if (active && Date.now() - checkedAt < CHECK_REUSE_MS) return Promise.resolve(true);
  checking = (async () => {
    active = undefined;
    lastErrors = [];
    for (const id of ORDER) {
      const p = PROVIDERS[id];
      const key = keyOf(p);
      if (!key) {
        console.log(`LLM check: ${id} skipped, ${p.keyVar} is not set`);
        lastErrors.push(`${id}: ${p.keyVar} is not set`);
        continue;
      }
      const started = Date.now();
      try {
        const text = await withTimeout(
          p.call(key, p.model, 'Reply with exactly this json: {"ok": true}', "Health check.", "fast", 20),
          CHECK_TIMEOUT_MS,
        );
        // Any JSON object proves the key, the model and JSON output work. Even with
        // "exactly", a model may improvise its own shape, e.g. {"status": "ok"}.
        const reply = lastJsonObject(text);
        if (!reply || typeof reply !== "object" || Object.keys(reply).length === 0) {
          throw new Error(`unexpected reply: ${text.slice(0, 100)}`);
        }
        console.log(`LLM check: ${id} (${p.model}) works, ${Date.now() - started} ms; using it`);
        active = p;
        checkedAt = Date.now();
        return true;
      } catch (err) {
        const message = (err as Error).message;
        console.warn(`LLM check: ${id} (${p.model}) failed after ${Date.now() - started} ms: ${message}`);
        lastErrors.push(`${id} (${p.model}): ${message.slice(0, 300)}`);
      }
    }
    console.error("LLM check: no provider works");
    return false;
  })().finally(() => (checking = undefined));
  return checking;
}

/**
 * For the lobby and the inspector: TEST or product setting, who answers the
 * Orchestrator's calls, and why each provider failed the last check.
 */
export function llmStatus(): { test: boolean; provider: string | null; errors: string[] } {
  return { test: TEST, provider: active ? `${active.id} (${active.model})` : null, errors: lastErrors };
}

/** The provider calls go to: the checked one, else the first with a key. */
async function provider(): Promise<Provider> {
  await checking;
  const p = active ?? ORDER.map((id) => PROVIDERS[id]).find(keyOf);
  if (!p) throw new Error(`no LLM key is set in .env (${ORDER.map((id) => PROVIDERS[id].keyVar).join(", ")})`);
  return p;
}

/** "deepseek (deepseek-flash)": who answers calls right now (`quick`: chatJson's quick calls), for logs. */
export async function providerName(quick = false): Promise<string> {
  const p = await provider();
  return `${p.id} (${modelOf(p, quick)})`;
}

const modelOf = (p: Provider, quick: boolean) => (quick && p.quickModel) || p.model;

/**
 * One chat call in JSON mode on the active provider; resolves with the parsed reply.
 * `quick`: on the provider's faster model if it has one (DeepSeek: deepseek-flash).
 */
export async function chatJson<T>(
  system: string,
  user: string,
  mode: QuestionMode,
  maxTokens: number,
  quick = false,
): Promise<Partial<T>> {
  const p = await provider();
  const text = await p.call(keyOf(p)!, modelOf(p, quick), system, user, mode, maxTokens);
  return lastJsonObject(text) as Partial<T>;
}

/**
 * One small JSON call to deepseek-flash without thinking, whatever the
 * Orchestrator's provider is; rejects after `timeoutMs` or without a DeepSeek key.
 * `maxTokens`: room for the reply (30 fits a yes/no verdict).
 */
export async function quickJson<T>(
  system: string,
  user: string,
  timeoutMs: number,
  maxTokens = 30,
): Promise<Partial<T>> {
  const key = process.env.DEEPSEEK_API_KEY?.trim();
  if (!key) throw new Error("DEEPSEEK_API_KEY is not set");
  const text = await chatCompletion(
    "DeepSeek",
    `${DEEPSEEK_BASE_URL}/chat/completions`,
    key,
    {
      model: QUICK_MODEL,
      messages: messages(system, user),
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
      max_tokens: maxTokens,
    },
    AbortSignal.timeout(timeoutMs),
  );
  return lastJsonObject(text) as Partial<T>;
}

/**
 * The last complete JSON object in a reply. JSON mode can return empty content
 * (documented by DeepSeek); Claude has no JSON mode and may wrap the object in a
 * code fence, or write a draft object, a comment, then the final object.
 */
function lastJsonObject(text: string): unknown {
  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
    } else if (c === "{") {
      if (depth++ === 0) start = i;
    } else if (c === "}" && depth > 0 && --depth === 0) {
      objects.push(text.slice(start, i + 1));
    }
  }
  for (const candidate of objects.reverse()) {
    try {
      return JSON.parse(candidate);
    } catch {
      // A malformed draft; try the one before it.
    }
  }
  return {};
}
