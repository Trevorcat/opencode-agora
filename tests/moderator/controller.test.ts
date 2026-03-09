import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { BlackboardStore } from "../../src/blackboard/store.js";
import type { AgentConfig } from "../../src/blackboard/types.js";
import { DebateController } from "../../src/moderator/controller.js";

const { mockCallAgent, mockCallVote } = vi.hoisted(() => ({
  mockCallAgent: vi.fn(),
  mockCallVote: vi.fn(),
}));

vi.mock("../../src/agents/process-manager.js", () => ({
  AgentProcessManager: vi.fn().mockImplementation(function AgentProcessManagerMock() {
    return {
      callAgent: mockCallAgent,
      callVote: mockCallVote,
    };
  }),
}));

describe("DebateController", () => {
  let rootDir: string;
  let store: BlackboardStore;
  let controller: DebateController;

  const agents: AgentConfig[] = [
    {
      role: "economist",
      persona: "Focuses on incentives and trade-offs",
      model: "openai/gpt-x",
    },
    {
      role: "ethicist",
      persona: "Focuses on fairness and harms",
      model: "openai/gpt-y",
    },
  ];

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), "debate-controller-test-"));
    store = new BlackboardStore(rootDir);
    await store.init();

    mockCallAgent.mockReset();
    mockCallVote.mockReset();

    mockCallAgent.mockImplementation((agent: AgentConfig, _msgs: unknown, round: number) =>
      Promise.resolve({
        role: agent.role,
        model: agent.model,
        round,
        timestamp: new Date().toISOString(),
        position: `${agent.role} position round ${round}`,
        reasoning: ["reason"],
        confidence: 0.75,
      }),
    );

    mockCallVote.mockImplementation((agent: AgentConfig) =>
      Promise.resolve({
        role: agent.role,
        model: agent.model,
        timestamp: new Date().toISOString(),
        chosen_position: "best position",
        rationale: "reasoning",
        confidence: 0.8,
      }),
    );

    controller = new DebateController({
      store,
      providers: new Map([
        ["openai", { baseURL: "https://example.com/v1", apiKey: "fake-key" }],
      ]),
      retryOpts: {
        maxAttempts: 1,
        baseDelayMs: 1,
      },
      timeoutMs: 500,
    });
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it("runDebate sets topic status to completed after full run", async () => {
    await controller.runDebate({
      topicId: "topic-completed",
      question: "Should we adopt congestion pricing?",
      context: "Urban traffic is increasing.",
      agents,
    });

    const topic = await store.getTopic("topic-completed");
    expect(topic?.status).toBe("completed");
  });

  it("runDebate saves posts for all 3 rounds", async () => {
    await controller.runDebate({
      topicId: "topic-rounds",
      question: "Should we adopt congestion pricing?",
      agents,
    });

    const round1Posts = await store.getRoundPosts("topic-rounds", 1);
    const round2Posts = await store.getRoundPosts("topic-rounds", 2);
    const round3Posts = await store.getRoundPosts("topic-rounds", 3);

    expect(round1Posts).toHaveLength(agents.length);
    expect(round2Posts).toHaveLength(agents.length);
    expect(round3Posts).toHaveLength(agents.length);

    expect(round1Posts.every((post) => post.round === 1)).toBe(true);
    expect(round2Posts.every((post) => post.round === 2)).toBe(true);
    expect(round3Posts.every((post) => post.round === 3)).toBe(true);
  });

  it("runDebate saves votes for each agent", async () => {
    await controller.runDebate({
      topicId: "topic-votes",
      question: "Should we adopt congestion pricing?",
      agents,
    });

    const votes = await store.getVotes("topic-votes");

    expect(votes).toHaveLength(agents.length);
    expect(votes.map((vote) => vote.role).sort()).toEqual(
      agents.map((agent) => agent.role).sort(),
    );
  });

  it("runDebate sets topic status to failed if all agents fail in round 1", async () => {
    mockCallAgent.mockRejectedValue(new Error("round-1-failure"));

    await expect(
      controller.runDebate({
        topicId: "topic-failed",
        question: "Should we adopt congestion pricing?",
        agents,
      }),
    ).rejects.toThrow("All agents failed in round 1");

    const topic = await store.getTopic("topic-failed");
    const round1Posts = await store.getRoundPosts("topic-failed", 1);
    const votes = await store.getVotes("topic-failed");

    expect(topic?.status).toBe("failed");
    expect(round1Posts).toHaveLength(0);
    expect(votes).toHaveLength(0);
  });
});
