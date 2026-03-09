import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { BlackboardStore } from "../../src/blackboard/store.js";
import type { AgentConfig, ProgressEvent } from "../../src/blackboard/types.js";
import { DebateController } from "../../src/moderator/controller.js";

// ─── Mock AgentProcessManager ────────────────────────────────────────────────
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

// ─── Shared Fixtures ──────────────────────────────────────────────────────────

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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("DebateController – progress events", () => {
  let rootDir: string;
  let store: BlackboardStore;
  let onProgress: ReturnType<typeof vi.fn>;
  let controller: DebateController;

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), "debate-progress-test-"));
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

    onProgress = vi.fn();

    controller = new DebateController({
      store,
      providers: new Map([
        ["openai", { baseURL: "https://example.com/v1", apiKey: "fake-key" }],
      ]),
      retryOpts: { maxAttempts: 1, baseDelayMs: 1 },
      timeoutMs: 500,
      onProgress,
    });
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  // ─── Helper to extract events by type ────────────────────────────────────────
  function events(type: ProgressEvent["type"]): ProgressEvent[] {
    return onProgress.mock.calls.map((call) => call[0] as ProgressEvent).filter((e) => e.type === type);
  }

  function allEvents(): ProgressEvent[] {
    return onProgress.mock.calls.map((call) => call[0] as ProgressEvent);
  }

  // ─── Test 1: "debate_started" emitted first with question ────────────────────

  it('emits "debate_started" first with the correct question', async () => {
    await controller.runDebate({
      topicId: "topic-p1",
      question: "Should we adopt congestion pricing?",
      agents,
    });

    const debateStartedEvents = events("debate_started");
    expect(debateStartedEvents).toHaveLength(1);

    const e = debateStartedEvents[0]!;
    expect(e.type).toBe("debate_started");
    // TypeScript narrows: debate_started has question field
    if (e.type === "debate_started") {
      expect(e.question).toBe("Should we adopt congestion pricing?");
      expect(e.topic_id).toBe("topic-p1");
      expect(typeof e.timestamp).toBe("string");
    }

    // Must be the very first event
    const firstEvent = allEvents()[0];
    expect(firstEvent?.type).toBe("debate_started");
  });

  // ─── Test 2: "round_started" emitted for rounds 1, 2, 3 ─────────────────────

  it('emits "round_started" for rounds 1, 2, and 3 in order', async () => {
    await controller.runDebate({
      topicId: "topic-p2",
      question: "Should we adopt congestion pricing?",
      agents,
    });

    const roundStartedEvents = events("round_started");
    expect(roundStartedEvents).toHaveLength(3);

    const roundNumbers = roundStartedEvents.map((e) => {
      if (e.type === "round_started") return e.round;
      return -1;
    });

    expect(roundNumbers).toEqual([1, 2, 3]);

    for (const e of roundStartedEvents) {
      expect(e.topic_id).toBe("topic-p2");
      expect(typeof e.timestamp).toBe("string");
    }
  });

  // ─── Test 3: "agent_thinking" emitted per agent per round (2 × 3 = 6) ────────

  it('emits "agent_thinking" once per agent per round (6 total for 2 agents × 3 rounds)', async () => {
    await controller.runDebate({
      topicId: "topic-p3",
      question: "Should we adopt congestion pricing?",
      agents,
    });

    const thinkingEvents = events("agent_thinking");
    expect(thinkingEvents).toHaveLength(6);

    // Each round should have one thinking event per agent
    for (let round = 1; round <= 3; round++) {
      const roundThinking = thinkingEvents.filter((e) => {
        if (e.type === "agent_thinking") return e.round === round;
        return false;
      });
      expect(roundThinking).toHaveLength(agents.length);

      const rolesInRound = roundThinking.map((e) => {
        if (e.type === "agent_thinking") return e.agent;
        return "";
      }).sort();
      expect(rolesInRound).toEqual(agents.map((a) => a.role).sort());
    }

    // Check fields on each event
    for (const e of thinkingEvents) {
      if (e.type === "agent_thinking") {
        expect(typeof e.agent).toBe("string");
        expect(typeof e.model).toBe("string");
        expect(typeof e.round).toBe("number");
        expect(e.topic_id).toBe("topic-p3");
      }
    }
  });

  // ─── Test 4: "agent_posted" emitted per agent per round with correct post ────

  it('emits "agent_posted" per agent per round with matching post data', async () => {
    await controller.runDebate({
      topicId: "topic-p4",
      question: "Should we adopt congestion pricing?",
      agents,
    });

    const postedEvents = events("agent_posted");
    expect(postedEvents).toHaveLength(6);

    for (let round = 1; round <= 3; round++) {
      const roundPosted = postedEvents.filter((e) => {
        if (e.type === "agent_posted") return e.round === round;
        return false;
      });
      expect(roundPosted).toHaveLength(agents.length);

      for (const e of roundPosted) {
        if (e.type === "agent_posted") {
          expect(e.post).toBeDefined();
          expect(e.post.round).toBe(round);
          expect(typeof e.post.role).toBe("string");
          expect(typeof e.post.position).toBe("string");
          expect(e.topic_id).toBe("topic-p4");
          expect(typeof e.timestamp).toBe("string");
        }
      }
    }

    // Verify post content matches what the mock returned
    const round1Posted = postedEvents.filter((e) => {
      if (e.type === "agent_posted") return e.round === 1;
      return false;
    });
    const economistPost = round1Posted.find((e) => {
      if (e.type === "agent_posted") return e.post.role === "economist";
      return false;
    });
    expect(economistPost).toBeDefined();
    if (economistPost?.type === "agent_posted") {
      expect(economistPost.post.position).toBe("economist position round 1");
    }
  });

  // ─── Test 5: "round_complete" emitted after each round with posts array ──────

  it('emits "round_complete" after each round with correct posts array', async () => {
    await controller.runDebate({
      topicId: "topic-p5",
      question: "Should we adopt congestion pricing?",
      agents,
    });

    const completeEvents = events("round_complete");
    expect(completeEvents).toHaveLength(3);

    for (let round = 1; round <= 3; round++) {
      const roundComplete = completeEvents.find((e) => {
        if (e.type === "round_complete") return e.round === round;
        return false;
      });
      expect(roundComplete).toBeDefined();

      if (roundComplete?.type === "round_complete") {
        expect(roundComplete.posts).toHaveLength(agents.length);
        expect(roundComplete.posts.every((p) => p.round === round)).toBe(true);
        expect(roundComplete.topic_id).toBe("topic-p5");
        expect(typeof roundComplete.timestamp).toBe("string");
      }
    }
  });

  // ─── Test 6: "voting_started" emitted after round 3 ─────────────────────────

  it('emits "voting_started" after round 3 completes', async () => {
    await controller.runDebate({
      topicId: "topic-p6",
      question: "Should we adopt congestion pricing?",
      agents,
    });

    const votingStartedEvents = events("voting_started");
    expect(votingStartedEvents).toHaveLength(1);

    const e = votingStartedEvents[0]!;
    expect(e.topic_id).toBe("topic-p6");
    expect(typeof e.timestamp).toBe("string");

    // voting_started must come after all round_complete events
    const allEvts = allEvents();
    const votingStartedIdx = allEvts.findIndex((evt) => evt.type === "voting_started");
    const round3CompleteIdx = allEvts.findLastIndex((evt) => {
      if (evt.type === "round_complete") return evt.round === 3;
      return false;
    });
    expect(votingStartedIdx).toBeGreaterThan(round3CompleteIdx);
  });

  // ─── Test 7: "vote_cast" emitted per agent vote ──────────────────────────────

  it('emits "vote_cast" once per agent with correct vote data', async () => {
    await controller.runDebate({
      topicId: "topic-p7",
      question: "Should we adopt congestion pricing?",
      agents,
    });

    const voteCastEvents = events("vote_cast");
    expect(voteCastEvents).toHaveLength(agents.length);

    const votingRoles = voteCastEvents.map((e) => {
      if (e.type === "vote_cast") return e.vote.role;
      return "";
    }).sort();
    expect(votingRoles).toEqual(agents.map((a) => a.role).sort());

    for (const e of voteCastEvents) {
      if (e.type === "vote_cast") {
        expect(e.vote).toBeDefined();
        expect(typeof e.vote.chosen_position).toBe("string");
        expect(typeof e.vote.rationale).toBe("string");
        expect(e.topic_id).toBe("topic-p7");
        expect(typeof e.timestamp).toBe("string");
      }
    }
  });

  // ─── Test 8: "debate_complete" emitted last ───────────────────────────────────

  it('emits "debate_complete" as the last event', async () => {
    await controller.runDebate({
      topicId: "topic-p8",
      question: "Should we adopt congestion pricing?",
      agents,
    });

    const completeEvents = events("debate_complete");
    expect(completeEvents).toHaveLength(1);

    const e = completeEvents[0]!;
    expect(e.topic_id).toBe("topic-p8");
    expect(typeof e.timestamp).toBe("string");

    // Must be the very last event emitted
    const allEvts = allEvents();
    const lastEvent = allEvts[allEvts.length - 1];
    expect(lastEvent?.type).toBe("debate_complete");
  });

  // ─── Test 9 (Failure): "agent_error" emitted when agent throws ───────────────

  it('emits "agent_error" when an agent throws, with error message', async () => {
    // Only one agent fails (the first call), then succeeds → debate still completes
    // Actually, if all agents fail in a round, the debate fails. Let's have the
    // second agent succeed so round_complete is emitted for round 1.
    let callCount = 0;
    mockCallAgent.mockImplementation(async (agent: AgentConfig, _msgs: unknown, round: number) => {
      callCount++;
      // First call (economist, round 1) throws; second call (ethicist, round 1) succeeds
      if (callCount === 1 && round === 1 && agent.role === "economist") {
        throw new Error("economist-network-error");
      }
      return {
        role: agent.role,
        model: agent.model,
        round,
        timestamp: new Date().toISOString(),
        position: `${agent.role} position round ${round}`,
        reasoning: ["reason"],
        confidence: 0.75,
      };
    });

    // The debate should still complete (one agent posted successfully)
    await controller.runDebate({
      topicId: "topic-p9",
      question: "Should we adopt congestion pricing?",
      agents,
    });

    const agentErrorEvents = events("agent_error");
    expect(agentErrorEvents.length).toBeGreaterThanOrEqual(1);

    const errorEvent = agentErrorEvents[0]!;
    if (errorEvent.type === "agent_error") {
      expect(errorEvent.agent).toBe("economist");
      expect(errorEvent.error).toContain("economist-network-error");
      expect(errorEvent.topic_id).toBe("topic-p9");
      expect(typeof errorEvent.round).toBe("number");
      expect(typeof errorEvent.timestamp).toBe("string");
    }
  });

  // ─── Test 10 (Failure): "error" emitted when debate fails completely ──────────

  it('emits "error" when the entire debate fails (all agents fail)', async () => {
    // All agents fail in round 1 → debate throws and emits "error"
    mockCallAgent.mockRejectedValue(new Error("catastrophic-failure"));

    await expect(
      controller.runDebate({
        topicId: "topic-p10",
        question: "Should we adopt congestion pricing?",
        agents,
      }),
    ).rejects.toThrow();

    const errorEvents = events("error");
    expect(errorEvents).toHaveLength(1);

    const e = errorEvents[0]!;
    if (e.type === "error") {
      expect(e.topic_id).toBe("topic-p10");
      expect(typeof e.message).toBe("string");
      expect(e.message.length).toBeGreaterThan(0);
      expect(typeof e.timestamp).toBe("string");
    }

    // "error" must be the last event emitted
    const allEvts = allEvents();
    const lastEvent = allEvts[allEvts.length - 1];
    expect(lastEvent?.type).toBe("error");
  });

  // ─── Test 11 (Blackboard): pinToBlackboard emits "blackboard_updated" ───────

  it('pinToBlackboard emits "blackboard_updated" with correct item', async () => {
    // Need a topic in the store so getLiveStatus works
    await store.saveTopic({
      id: "topic-p11",
      question: "Should we adopt congestion pricing?",
      status: "running",
      config: { max_rounds: 3, consensus_threshold: 0.66, agents },
      created_at: new Date().toISOString(),
    });

    await controller.pinToBlackboard(
      "topic-p11",
      "Key consensus: congestion pricing reduces peak-hour traffic",
      "consensus",
      { editable: false, metadata: { confidence: 0.9 } },
    );

    const blackboardUpdatedEvents = events("blackboard_updated");
    expect(blackboardUpdatedEvents).toHaveLength(1);

    const e = blackboardUpdatedEvents[0]!;
    if (e.type === "blackboard_updated") {
      expect(e.topic_id).toBe("topic-p11");
      expect(e.item).toBeDefined();
      expect(e.item.type).toBe("consensus");
      expect(e.item.content).toBe("Key consensus: congestion pricing reduces peak-hour traffic");
      expect(e.item.author).toBe("moderator");
      expect(e.item.pinned).toBe(true);
      expect(e.item.editable).toBe(false);
      expect(e.item.metadata?.confidence).toBe(0.9);
      expect(typeof e.item.id).toBe("string");
      expect(typeof e.timestamp).toBe("string");
    }

    // Verify item was persisted in the store
    const blackboard = await store.getBlackboard("topic-p11");
    expect(blackboard).toHaveLength(1);
    expect(blackboard[0]!.content).toBe(
      "Key consensus: congestion pricing reduces peak-hour traffic",
    );
  });
});
