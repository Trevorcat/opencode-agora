// src/utils/language-detect.ts
// Zero-dependency language detection via Unicode range matching.

export type DetectedLanguage = "zh" | "ja" | "ko" | "ar" | "ru" | "en" | "unknown";

/**
 * Detect the primary language of a text string using Unicode character ranges.
 * Returns the most likely language code, or 'en' as default.
 */
export function detectLanguage(text: string): DetectedLanguage {
  const stripped = text.replace(/\s/g, "");
  const total = stripped.length;

  if (total === 0) return "en";

  // Count characters in each Unicode range
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const kana = (text.match(/[\u3040-\u309f\u30a0-\u30ff]/g) ?? []).length;
  const hangul = (text.match(/[\uac00-\ud7af]/g) ?? []).length;
  const arabic = (text.match(/[\u0600-\u06ff]/g) ?? []).length;
  const cyrillic = (text.match(/[\u0400-\u04ff]/g) ?? []).length;

  // Order matters: kana before CJK (Japanese uses kanji too)
  if (kana / total > 0.1) return "ja";
  if (hangul / total > 0.1) return "ko";
  if (cjk / total > 0.1) return "zh";
  if (arabic / total > 0.1) return "ar";
  if (cyrillic / total > 0.1) return "ru";

  return "en";
}

/**
 * Get a language instruction string to inject into system prompts.
 * Returns empty string for English (no change needed).
 */
export function getLanguageInstruction(lang: DetectedLanguage): string {
  const map: Record<DetectedLanguage, string> = {
    zh: "You MUST respond entirely in Chinese (中文). All position, reasoning, rationale, and comment values must be in Chinese.",
    ja: "You MUST respond entirely in Japanese (日本語). All position, reasoning, rationale, and comment values must be in Japanese.",
    ko: "You MUST respond entirely in Korean (한국어). All position, reasoning, rationale, and comment values must be in Korean.",
    ar: "You MUST respond entirely in Arabic (العربية). All position, reasoning, rationale, and comment values must be in Arabic.",
    ru: "You MUST respond entirely in Russian (Русский). All position, reasoning, rationale, and comment values must be in Russian.",
    en: "",
    unknown: "",
  };
  return map[lang];
}
