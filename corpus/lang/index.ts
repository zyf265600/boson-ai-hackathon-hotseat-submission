// The language packs, by code. pack(lang) is what the rest of the app reads.
import type { Language } from "../../shared/languages";
import { de } from "./de";
import { en } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { ja } from "./ja";
import { ko } from "./ko";
import { pt } from "./pt";
import type { LanguagePack } from "./types";
import { zh } from "./zh";

export type { HandoffAfter, LanguagePack, PanelNames, Seat } from "./types";

/** `\b` as letters of any script count: JavaScript's `\b` sees "é" or "ñ" as a word break. */
const WORD_BREAK = "(?:(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_])|(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_]))";

function unicodeWords(re: RegExp): RegExp {
  if (!re.source.includes("\\b")) return re;
  const flags = re.flags.includes("u") ? re.flags : `${re.flags}u`;
  return new RegExp(re.source.replace(/\\b/g, WORD_BREAK), flags);
}

/** Every rule regex rewritten with unicodeWords, so "sé" or "não" end a word. */
function withUnicodeRules(p: LanguagePack): LanguagePack {
  const r = p.rules;
  const all = (list: RegExp[]) => list.map(unicodeWords);
  return {
    ...p,
    rules: {
      ...r,
      end: all(r.end),
      repeat: all(r.repeat),
      clarify: all(r.clarify),
      dontKnow: all(r.dontKnow),
      skip: all(r.skip),
      yes: unicodeWords(r.yes),
      no: unicodeWords(r.no),
      holdOn: unicodeWords(r.holdOn),
      filler: unicodeWords(r.filler),
      longClarify: unicodeWords(r.longClarify),
      thinking: unicodeWords(r.thinking),
      secondAsk: unicodeWords(r.secondAsk),
    },
  };
}

const PACKS: Record<Language, LanguagePack> = {
  en: withUnicodeRules(en),
  zh: withUnicodeRules(zh),
  es: withUnicodeRules(es),
  fr: withUnicodeRules(fr),
  de: withUnicodeRules(de),
  ja: withUnicodeRules(ja),
  ko: withUnicodeRules(ko),
  pt: withUnicodeRules(pt),
};

export const pack = (lang: Language): LanguagePack => PACKS[lang];
