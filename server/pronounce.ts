// How the company name from the prep room is said aloud. When an interview is created
// with a company, deepseek-flash is asked how a TTS voice speaking the interview language
// should be given the name so it says it right: the name as is when it is already read
// right ("Google", "Nvidia"), else a respelling ("Huawei" → "WAH-way"). The answer is stored
// on the interview row (company_say); TTS gets it in place of the name (spokenText), and
// the moderator's opening tells Realtime to say the name that way (corpus/lang opening).
import { LANGUAGES, type Language } from "../shared/languages";
import type { CompanyPronunciation, InterviewSettings } from "../shared/settings";
import { quickJson } from "./llm";

/** The whole wait: the interview row is created after it, on the prep room's waiting screen. */
const TIMEOUT_MS = 1500;

// Conservative since 2026-10-23: Higgs TTS read "NVIDIA" right as written (Whisper heard
// "NVIDIA"), but "en-VID-ee-uh" came out worse (heard "NVIDE"), and the first prompt
// respelled Shopify and Porsche too. Only names a voice would clearly get wrong are respelled.
const SYSTEM =
  "You help a text-to-speech (TTS) voice pronounce a company name correctly. " +
  "You get the company name and the language the voice speaks. " +
  "Modern TTS voices already say well-known brands and ordinary spellings correctly, and a respelling often " +
  "sounds worse, so by default return the name unchanged. " +
  "Only when you are confident the voice would clearly mispronounce the written name in that language " +
  "(a foreign spelling with sounds that language does not read that way, such as Chinese pinyin or French " +
  "silent letters) return a phonetic respelling the voice would read the way the company says its own name: " +
  "plain letters only, syllables joined by hyphens, the stressed syllable in capitals. For Chinese, Japanese " +
  "or Korean, the name's usual written form in that language is fine instead. " +
  'Examples for English: "Google" → "Google"; "Nvidia" → "Nvidia"; "Shopify" → "Shopify"; ' +
  '"Porsche" → "Porsche"; "Huawei" → "WAH-way"; "Xiaomi" → "SHAO-mee"; "Hermès" → "air-MEZZ". ' +
  'Answer with JSON only: {"say": "..."}.';

/** A respelling that can go into a TTS line or an instruction: one line, letters and simple punctuation. */
const SAFE = /^[\p{L}\p{M}\p{N} .,'&+-]{1,120}$/u;

/** How to say `company` in `lang`; never rejects (the name as typed on a timeout, an error or an odd answer). */
export async function companyPronunciation(company: string, lang: Language): Promise<CompanyPronunciation> {
  const started = Date.now();
  try {
    const reply = await quickJson<{ say?: unknown }>(
      SYSTEM,
      `Company: ${company}\nLanguage the voice speaks: ${LANGUAGES[lang].label}`,
      TIMEOUT_MS,
      60,
    );
    const say = typeof reply.say === "string" ? reply.say.trim() : "";
    if (!SAFE.test(say)) throw new Error(`unusable answer: ${JSON.stringify(reply.say)}`);
    return { company, say, ms: Date.now() - started, source: "llm" };
  } catch (err) {
    const error = (err as Error).name === "TimeoutError" ? `timeout after ${TIMEOUT_MS} ms` : (err as Error).message;
    return { company, say: company, ms: Date.now() - started, source: "fallback", error };
  }
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A letter or digit of a Latin-script word: a name that starts or ends with one must not touch another. */
const LATIN = "[\\p{Script=Latin}\\p{N}_]";

/**
 * `text` as TTS should get it: each whole-word occurrence of the interview's company
 * (any case) replaced by its respelling. Unchanged without a company or when the
 * respelling is the name itself. Only what is synthesised changes; the line shown
 * and saved stays as written. A name next to Chinese or Japanese characters still
 * counts as a whole word (only Latin letters and digits join a Latin name).
 */
export function spokenText(text: string, settings: InterviewSettings | null): string {
  const company = settings?.company.trim() ?? "";
  const say = settings?.companySay?.trim() ?? "";
  if (!company || !say || say === company) return text;
  const before = new RegExp(LATIN, "u").test(company[0]) ? `(?<!${LATIN})` : "";
  const after = new RegExp(LATIN, "u").test(company[company.length - 1]) ? `(?!${LATIN})` : "";
  return text.replace(new RegExp(`${before}${escape(company)}${after}`, "giu"), () => say);
}
