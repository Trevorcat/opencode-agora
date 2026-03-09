import { describe, expect, it } from "vitest";
import {
  detectLanguage,
  getLanguageInstruction,
  type DetectedLanguage,
} from "../../src/utils/language-detect.js";

describe("detectLanguage", () => {
  it("detects Chinese text", () => {
    expect(detectLanguage("城市应该实施拥堵收费吗？")).toBe("zh");
  });

  it("detects Chinese with mixed English terms", () => {
    expect(detectLanguage("如何优化 React 组件的性能？")).toBe("zh");
  });

  it("detects Japanese text (hiragana/katakana)", () => {
    expect(detectLanguage("これはテストです")).toBe("ja");
  });

  it("detects Japanese with kanji", () => {
    // Contains both kanji and kana — kana ratio should trigger 'ja'
    expect(detectLanguage("都市は混雑料金を導入すべきですか？")).toBe("ja");
  });

  it("detects Korean text", () => {
    expect(detectLanguage("도시가 혼잡 요금을 시행해야 합니까?")).toBe("ko");
  });

  it("detects Arabic text", () => {
    expect(detectLanguage("هل يجب على المدينة تطبيق رسوم الازدحام؟")).toBe("ar");
  });

  it("detects Russian text", () => {
    expect(detectLanguage("Должен ли город ввести плату за перегрузку?")).toBe("ru");
  });

  it("returns 'en' for English text", () => {
    expect(detectLanguage("Should the city implement congestion pricing?")).toBe("en");
  });

  it("returns 'en' for empty string", () => {
    expect(detectLanguage("")).toBe("en");
  });

  it("returns 'en' for whitespace-only string", () => {
    expect(detectLanguage("   \n\t  ")).toBe("en");
  });

  it("returns 'en' for ASCII-only text", () => {
    expect(detectLanguage("Hello world 123 !@#$%")).toBe("en");
  });
});

describe("getLanguageInstruction", () => {
  it("returns Chinese instruction for 'zh'", () => {
    const result = getLanguageInstruction("zh");
    expect(result).toContain("Chinese");
    expect(result).toContain("中文");
    expect(result).toContain("MUST");
  });

  it("returns Japanese instruction for 'ja'", () => {
    const result = getLanguageInstruction("ja");
    expect(result).toContain("Japanese");
    expect(result).toContain("日本語");
  });

  it("returns Korean instruction for 'ko'", () => {
    const result = getLanguageInstruction("ko");
    expect(result).toContain("Korean");
    expect(result).toContain("한국어");
  });

  it("returns Arabic instruction for 'ar'", () => {
    const result = getLanguageInstruction("ar");
    expect(result).toContain("Arabic");
    expect(result).toContain("العربية");
  });

  it("returns Russian instruction for 'ru'", () => {
    const result = getLanguageInstruction("ru");
    expect(result).toContain("Russian");
    expect(result).toContain("Русский");
  });

  it("returns empty string for 'en'", () => {
    expect(getLanguageInstruction("en")).toBe("");
  });

  it("returns empty string for 'unknown'", () => {
    expect(getLanguageInstruction("unknown")).toBe("");
  });

  it("all non-empty instructions mention values should be in target language", () => {
    const nonEnglish: DetectedLanguage[] = ["zh", "ja", "ko", "ar", "ru"];
    for (const lang of nonEnglish) {
      const instruction = getLanguageInstruction(lang);
      expect(instruction).toContain("values must be in");
    }
  });
});
