import { beforeEach, describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import { ConsensusSynthesizer } from "../../src/consensus/synthesizer";

const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}));

vi.mock("openai", () => {
  const MockOpenAI = vi.fn(function MockOpenAI() {
    return {
      chat: { completions: { create: mockCreate } },
    };
  });

  return {
    default: Object.assign(MockOpenAI, { __mockCreate: mockCreate }),
  };
});

describe("ConsensusSynthesizer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MOD_KEY = "fake";
  });

  it("synthesize returns consensus with expected topic and metadata", async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              conclusion: "Adopt option A",
              confidence: 0.82,
              key_arguments: ["A has strongest evidence"],
              dissenting_views: ["B might be cheaper"],
              convergence_method: "majority_vote",
            }),
          },
        },
      ],
    });

    const synthesizer = new ConsensusSynthesizer({
      provider: {
        baseURL: "https://example.test",
        apiKeyEnv: "MOD_KEY",
      },
      moderatorModel: "gpt-moderator",
    });

    const result = await synthesizer.synthesize({
      topicId: "topic-123",
      question: "Which architecture should we use?",
      votes: [
        {
          role: "architect",
          model: "m1",
          timestamp: "2026-03-09T10:00:00.000Z",
          chosen_position: "A",
          rationale: "Best scalability",
          confidence: 0.9,
        },
      ],
      allPosts: [[]],
      roundsTaken: 2,
    });

    expect(result.topic_id).toBe("topic-123");
    expect(result.conclusion).toBe("Adopt option A");
    expect(result.rounds_taken).toBe(2);
    expect(result.generated_by).toBe("gpt-moderator");

    expect(OpenAI).toHaveBeenCalledWith({
      baseURL: "https://example.test",
      apiKey: "fake",
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("synthesize computes vote_distribution from votes", async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              conclusion: "A is preferred",
              confidence: 0.75,
              key_arguments: ["A is robust"],
              dissenting_views: ["B is simpler"],
              convergence_method: "moderated_summary",
            }),
          },
        },
      ],
    });

    const synthesizer = new ConsensusSynthesizer({
      provider: {
        baseURL: "https://example.test",
        apiKeyEnv: "MOD_KEY",
      },
      moderatorModel: "gpt-moderator",
    });

    const result = await synthesizer.synthesize({
      topicId: "topic-456",
      question: "Choose A or B",
      votes: [
        {
          role: "r1",
          model: "m1",
          timestamp: "2026-03-09T10:00:00.000Z",
          chosen_position: "A",
          rationale: "A is better",
          confidence: 0.8,
        },
        {
          role: "r2",
          model: "m2",
          timestamp: "2026-03-09T10:01:00.000Z",
          chosen_position: "A",
          rationale: "Also A",
          confidence: 0.7,
        },
        {
          role: "r3",
          model: "m3",
          timestamp: "2026-03-09T10:02:00.000Z",
          chosen_position: "B",
          rationale: "I prefer B",
          confidence: 0.6,
        },
      ],
      allPosts: [[], []],
      roundsTaken: 2,
    });

    expect(result.vote_distribution).toEqual({ A: 2, B: 1 });
  });
});
