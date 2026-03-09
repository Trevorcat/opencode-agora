import { beforeEach, describe, expect, it, vi } from "vitest";
import OpenAI from "openai";

import type { AgentConfig, ProviderConfig } from "../../src/blackboard/types.js";
import { AgentProcessManager } from "../../src/agents/process-manager.js";

vi.mock("openai", () => {
  const mockCreate = vi.fn();
  const MockOpenAI = vi.fn(function MockOpenAI() {
    return {
      chat: { completions: { create: mockCreate } },
    };
  });
  Object.defineProperty(MockOpenAI, "__mockCreate", { value: mockCreate });
  return { default: MockOpenAI };
});

type OpenAIMockWithCreate = typeof OpenAI & {
  __mockCreate: ReturnType<typeof vi.fn>;
};

const providers: Record<string, ProviderConfig> = {
  test: {
    baseURL: "https://example.invalid/v1",
    apiKeyEnv: "TEST_API_KEY",
  },
};

const agent: AgentConfig = {
  role: "analyst",
  persona: "evidence-driven",
  model: "gpt-test",
  provider: "test",
};

const messages = [{ role: "user", content: "hello" }] as const;

describe("AgentProcessManager", () => {
  beforeEach(() => {
    process.env.TEST_API_KEY = "fake-key";
    vi.clearAllMocks();
  });

  it("callAgent success with valid JSON returns Post with correct fields", async () => {
    const mockCreate = (OpenAI as OpenAIMockWithCreate).__mockCreate;
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              position: "Adopt policy",
              reasoning: ["Reason A", "Reason B"],
              confidence: 1.4,
              open_questions: ["What are costs?"],
            }),
          },
        },
      ],
    });

    const manager = new AgentProcessManager(providers);
    const result = await manager.callAgent(agent, [...messages], 2);

    expect(result.role).toBe(agent.role);
    expect(result.model).toBe(agent.model);
    expect(result.round).toBe(2);
    expect(Date.parse(result.timestamp)).not.toBeNaN();
    expect(result.position).toBe("Adopt policy");
    expect(result.reasoning).toEqual(["Reason A", "Reason B"]);
    expect(result.open_questions).toEqual(["What are costs?"]);
    expect(result.confidence).toBe(1);

    expect(mockCreate).toHaveBeenCalledWith({
      model: agent.model,
      messages,
      response_format: { type: "json_object" },
    });
  });

  it("callAgent empty response content throws", async () => {
    const mockCreate = (OpenAI as OpenAIMockWithCreate).__mockCreate;
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: null } }],
    });

    const manager = new AgentProcessManager(providers);

    await expect(manager.callAgent(agent, [...messages], 1)).rejects.toThrow();
  });

  it("callAgent invalid JSON throws", async () => {
    const mockCreate = (OpenAI as OpenAIMockWithCreate).__mockCreate;
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "{not-json}" } }],
    });

    const manager = new AgentProcessManager(providers);

    await expect(manager.callAgent(agent, [...messages], 1)).rejects.toThrow();
  });

  it("callVote success returns Vote with correct fields", async () => {
    const mockCreate = (OpenAI as OpenAIMockWithCreate).__mockCreate;
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              chosen_position: "Adopt policy",
              rationale: "Best balances tradeoffs",
              confidence: -0.2,
              dissent_notes: "Need stronger safeguards",
            }),
          },
        },
      ],
    });

    const manager = new AgentProcessManager(providers);
    const result = await manager.callVote(agent, [...messages]);

    expect(result.role).toBe(agent.role);
    expect(result.model).toBe(agent.model);
    expect(Date.parse(result.timestamp)).not.toBeNaN();
    expect(result.chosen_position).toBe("Adopt policy");
    expect(result.rationale).toBe("Best balances tradeoffs");
    expect(result.dissent_notes).toBe("Need stronger safeguards");
    expect(result.confidence).toBe(0);

    expect(mockCreate).toHaveBeenCalledWith({
      model: agent.model,
      messages,
      response_format: { type: "json_object" },
    });
  });
});
