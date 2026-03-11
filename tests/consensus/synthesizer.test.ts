import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConsensusSynthesizer } from "../../src/consensus/synthesizer.js";

const { mockCreateSession, mockSendMessage, mockDeleteSession } = vi.hoisted(() => ({
  mockCreateSession: vi.fn(),
  mockSendMessage: vi.fn(),
  mockDeleteSession: vi.fn(),
}));

vi.mock("../../src/agents/opencode-http-client.js", () => ({
  OpenCodeHttpClient: vi.fn().mockImplementation(function () {
    return {
      createSession: mockCreateSession,
      sendMessage: mockSendMessage,
      deleteSession: mockDeleteSession,
    };
  }),
}));

describe("ConsensusSynthesizer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSession.mockResolvedValue("sess-123");
    mockDeleteSession.mockResolvedValue(undefined);
  });

  it("synthesize returns consensus with expected topic and metadata", async () => {
    mockSendMessage.mockResolvedValue({
      conclusion: "Adopt option A",
      confidence: 0.82,
      key_arguments: ["A has strongest evidence"],
      dissenting_views: ["B might be cheaper"],
      convergence_method: "majority_vote",
    });

    const synthesizer = new ConsensusSynthesizer({
      opencodeUrl: "http://127.0.0.1:4096",
      directory: "/tmp/test",
      moderatorModel: "test/gpt-moderator",
    });

    const result = await synthesizer.synthesize({
      topicId: "topic-123",
      question: "Which architecture should we use?",
      votes: [
        {
          role: "architect",
          model: "m1",
          timestamp: "...",
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
    expect(result.generated_by).toBe("test/gpt-moderator");
    expect(mockCreateSession).toHaveBeenCalledTimes(1);
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
  });

  it("synthesize computes vote_distribution from votes", async () => {
    mockSendMessage.mockResolvedValue({
      conclusion: "A is preferred",
      confidence: 0.75,
      key_arguments: ["A is robust"],
      dissenting_views: ["B is simpler"],
      convergence_method: "moderated_summary",
    });

    const synthesizer = new ConsensusSynthesizer({
      opencodeUrl: "http://127.0.0.1:4096",
      directory: "/tmp/test",
      moderatorModel: "test/gpt-moderator",
    });

    const result = await synthesizer.synthesize({
      topicId: "topic-456",
      question: "Choose A or B",
      votes: [
        {
          role: "r1",
          model: "m1",
          timestamp: "...",
          chosen_position: "A",
          rationale: "A is better",
          confidence: 0.8,
        },
        {
          role: "r2",
          model: "m2",
          timestamp: "...",
          chosen_position: "A",
          rationale: "Also A",
          confidence: 0.7,
        },
        {
          role: "r3",
          model: "m3",
          timestamp: "...",
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
