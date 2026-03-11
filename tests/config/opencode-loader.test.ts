import { describe, expect, it } from "vitest";
import type { OpenCodeConfig } from "../../src/blackboard/types.js";
import {
  parseModelId,
  listAvailableModels,
  type AvailableModel,
} from "../../src/config/opencode-loader.js";

describe("parseModelId", () => {
  it("parses provider/model format", () => {
    const result = parseModelId("lilith/claude-opus-4-6");
    expect(result).toEqual({ provider: "lilith", model: "claude-opus-4-6" });
  });

  it("handles model names containing slashes after the first", () => {
    const result = parseModelId("local/deep/seek-r2");
    expect(result).toEqual({ provider: "local", model: "deep/seek-r2" });
  });

  it("throws on model ID without slash", () => {
    expect(() => parseModelId("no-slash")).toThrow(
      'Invalid model ID "no-slash": must be "provider/model" format',
    );
  });

  it("throws on empty string", () => {
    expect(() => parseModelId("")).toThrow("Invalid model ID");
  });
});

describe("listAvailableModels", () => {
  it("returns 4 models for a config with 2 providers each having 2 models", () => {
    const config: OpenCodeConfig = {
      provider: {
        lilith: {
          options: { baseURL: "https://llm-proxy.example.com/v1", apiKey: "key-1" },
          models: {
            "claude-opus-4-6": { name: "Claude Opus 4.6" },
            "claude-sonnet-4-5": { name: "Claude Sonnet 4.5" },
          },
        },
        codex: {
          options: { baseURL: "https://codex.example.com/v1", apiKey: "key-2" },
          models: {
            "gpt-4o": { name: "GPT-4o" },
            "gpt-4-turbo": { name: "GPT-4 Turbo" },
          },
        },
      },
    };

    const result = listAvailableModels(config);

    expect(result).toHaveLength(4);
    expect(result).toEqual(
      expect.arrayContaining<AvailableModel>([
        { id: "lilith/claude-opus-4-6", name: "Claude Opus 4.6", provider: "lilith" },
        { id: "lilith/claude-sonnet-4-5", name: "Claude Sonnet 4.5", provider: "lilith" },
        { id: "codex/gpt-4o", name: "GPT-4o", provider: "codex" },
        { id: "codex/gpt-4-turbo", name: "GPT-4 Turbo", provider: "codex" },
      ]),
    );
  });

  it("returns empty array for empty providers", () => {
    const config: OpenCodeConfig = {
      provider: {},
    };

    const result = listAvailableModels(config);

    expect(result).toEqual([]);
  });

  it("verifies id format is provider/model", () => {
    const config: OpenCodeConfig = {
      provider: {
        testprovider: {
          options: { baseURL: "https://test.com/v1", apiKey: "key" },
          models: {
            "test-model": { name: "Test Model" },
          },
        },
      },
    };

    const result = listAvailableModels(config);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("testprovider/test-model");
    expect(result[0].provider).toBe("testprovider");
    expect(result[0].name).toBe("Test Model");
  });
});
