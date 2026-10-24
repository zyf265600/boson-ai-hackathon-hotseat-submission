// The languages an interview can run in. One language per interview: speech
// recognition, every spoken line, every instruction to Realtime and every prompt
// to the LLMs switch together (2026-10-23). The words themselves are in
// corpus/lang/<code>.ts; this file holds the codes each service wants and the
// text helpers that do not depend on English.

export type Language = "en" | "zh" | "es" | "fr" | "de" | "ja" | "ko" | "pt";

export interface LanguageInfo {
  /** As a language menu shows it. */
  label: string;
  /** ISO 639-1, for Higgs STT (Realtime transcription) and Whisper. */
  stt: string;
  /** ISO 639-3, for Higgs TTS 3's `language` (two-letter codes are refused there). */
  tts: string;
  /** BCP 47, for the browser's speech recognition. */
  browser: string;
  /** Written without spaces between words: lengths are counted in characters, not words. */
  countChars: boolean;
}

export const LANGUAGES: Record<Language, LanguageInfo> = {
  en: { label: "English - USA", stt: "en", tts: "eng", browser: "en-US", countChars: false },
  zh: { label: "简体中文 (Chinese) - Simplified", stt: "zh", tts: "cmn", browser: "zh-CN", countChars: true },
  es: { label: "Español (Spanish) - LatAm", stt: "es", tts: "spa", browser: "es-MX", countChars: false },
  fr: { label: "Français (French) - France", stt: "fr", tts: "fra", browser: "fr-FR", countChars: false },
  de: { label: "Deutsch (German)", stt: "de", tts: "deu", browser: "de-DE", countChars: false },
  ja: { label: "日本語 (Japanese)", stt: "ja", tts: "jpn", browser: "ja-JP", countChars: true },
  ko: { label: "한국어 (Korean)", stt: "ko", tts: "kor", browser: "ko-KR", countChars: false },
  pt: { label: "Português (Portuguese) - Brazil", stt: "pt", tts: "por", browser: "pt-BR", countChars: false },
};

export const DEFAULT_LANGUAGE: Language = "en";

export const isLanguage = (value: unknown): value is Language =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(LANGUAGES, value);

/** `value` if it names a language, else the default. */
export const languageOr = (value: unknown): Language => (isLanguage(value) ? value : DEFAULT_LANGUAGE);

/** Lowercase, with everything but letters, digits and apostrophes turned into single spaces. */
export const plainText = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}' ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * The units a length is counted in: words, or for a language written without
 * spaces (Chinese, Japanese) its characters, punctuation left out.
 */
export function units(text: string, lang: Language): string[] {
  if (LANGUAGES[lang].countChars) return text.match(/[\p{L}\p{N}]/gu) ?? [];
  return text.split(/\s+/).filter(Boolean);
}

/** Joins units back into text, as `units` split it (punctuation is lost for character languages). */
export const joinUnits = (parts: string[], lang: Language) => parts.join(LANGUAGES[lang].countChars ? "" : " ");

/** Question marks: the full-width one too. */
export const QUESTION_MARK = /[?？]/g;

/** A line split into the units it is spoken in, punctuation kept: words, or characters for Chinese and Japanese. */
export const spokenUnits = (text: string, lang: Language): string[] =>
  LANGUAGES[lang].countChars ? Array.from(text.replace(/\s+/g, "")) : text.split(/\s+/).filter(Boolean);
