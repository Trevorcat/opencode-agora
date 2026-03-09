import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenCodeConfig, ResolvedProvider } from "../../src/blackboard/types.js";
import { parseModelId, resolveProviders, resolveModelProvider } from "../../src/config/opencode-loader.js";

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

describe("resolveProviders", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("resolves providers with literal API keys", () => {
    const config: OpenCodeConfig = {
      provider: {
        kimi: {
          options: { baseURL: "https://api.kimi.com/v1", apiKey: "sk-literal-key" },
          models: {},
        },
      },
    };

    const result = resolveProviders(config);

    expect(result.size).toBe(1);
    expect(result.get("kimi")).toEqual({
      baseURL: "https://api.kimi.com/v1",
      apiKey: "sk-literal-key",
    });
  });

  it("resolves providers with {env:VAR} API key pattern", () => {
    process.env.MY_API_KEY = "resolved-key-value";

    const config: OpenCodeConfig = {
      provider: {
        lilith: {
          options: { baseURL: "https://llm-proxy.example.com/v1", apiKey: "{env:MY_API_KEY}" },
          models: {},
        },
      },
    };

    const result = resolveProviders(config);

    expect(result.get("lilith")).toEqual({
      baseURL: "https://llm-proxy.example.com/v1",
      apiKey: "resolved-key-value",
    });
  });

  it("throws when env var referenced by {env:VAR} is not set", () => {
    delete process.env.MISSING_VAR;

    const config: OpenCodeConfig = {
      provider: {
        broken: {
          options: { baseURL: "https://example.com/v1", apiKey: "{env:MISSING_VAR}" },
          models: {},
        },
      },
    };

    expect(() => resolveProviders(config)).toThrow("MISSING_VAR");
  });

  it("resolves multiple providers", () => {
    process.env.KEY_A = "key-a";
    process.env.KEY_B = "key-b";

    const config: OpenCodeConfig = {
      provider: {
        a: { options: { baseURL: "https://a.com/v1", apiKey: "{env:KEY_A}" }, models: {} },
        b: { options: { baseURL: "https://b.com/v1", apiKey: "{env:KEY_B}" }, models: {} },
      },
    };

    const result = resolveProviders(config);

    expect(result.size).toBe(2);
    expect(result.get("a")?.apiKey).toBe("key-a");
    expect(result.get("b")?.apiKey).toBe("key-b");
  });
});

describe("resolveModelProvider", () => {
  const providers = new Map<string, ResolvedProvider>([
    ["lilith", { baseURL: "https://llm-proxy.example.com/v1", apiKey: "key-1" }],
    ["codex", { baseURL: "https://codex.example.com/v1", apiKey: "key-2" }],
  ]);

  it("resolves a valid fully qualified model ID", () => {
    const result = resolveModelProvider("lilith/claude-opus-4-6", providers);

    expect(result.provider).toEqual({
      baseURL: "https://llm-proxy.example.com/v1",
      apiKey: "key-1",
    });
    expect(result.modelName).toBe("claude-opus-4-6");
  });

  it("throws when provider is not found", () => {
    expect(() => resolveModelProvider("unknown/model-x", providers)).toThrow(
      'Provider "unknown" not found',
    );
  });

  it("throws on invalid model ID format", () => {
    expect(() => resolveModelProvider("no-slash", providers)).toThrow(
      'Invalid model ID "no-slash"',
    );
  });
});
