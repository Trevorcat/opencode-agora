import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { BlackboardStore } from "../../src/blackboard/store.js";
import type { AgentConfig, ProgressEvent } from "../../src/blackboard/types.js";
import { DebateController } from "../../src/moderator/controller.js";

// ─── Mock AgentProcessManager ─────────────────────────────────────────────────
const { mockCallAgent, mockCallVote, mockCreateSession, mockDeleteSession } = vi.hoisted(() => ({
  mockCallAgent: vi.fn(),
  mockCallVote: vi.fn(),
  mockCreateSession: vi.fn().mockResolvedValue("mock-session-id"),
  mockDeleteSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/agents/process-manager.js", () => ({
  AgentProcessManager: vi.fn().mockImplementation(function AgentProcessManagerMock() {
    return {
      createSession: mockCreateSession,
      deleteSession: mockDeleteSession,
      callAgent: mockCallAgent,
      callVote: mockCallVote,
    };
  }),
}));

// ─── Mock prompt-builder to capture calls ─────────────────────────────────────
const { mockBuildRound1Prompt, mockBuildRoundNPrompt } = vi.hoisted(() => ({
  mockBuildRound1Prompt: vi.fn(),
  mockBuildRoundNPrompt: vi.fn(),
}));

vi.mock("../../src/moderator/prompt-builder.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/moderator/prompt-builder.js")>();
  return {
    ...actual,
    buildRound1Prompt: (params: Parameters<typeof actual.buildRound1Prompt>[0]) => {
      mockBuildRound1Prompt(params);
      return actual.buildRound1Prompt(params);
    },
    buildRoundNPrompt: (params: Parameters<typeof actual.buildRoundNPrompt>[0]) => {
      mockBuildRoundNPrompt(params);
      return actual.buildRoundNPrompt(params);
    },
  };
});

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

describe("DebateController – guidance", () => {
  let rootDir: string;
  let store: BlackboardStore;
  let onProgressMock: ReturnType<typeof vi.fn>;
  let controller: DebateController;

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), "debate-guidance-test-"));
    store = new BlackboardStore(rootDir);
    await store.init();

    mockCallAgent.mockReset();
    mockCallVote.mockReset();
    mockCreateSession.mockReset();
    mockDeleteSession.mockReset();
    mockCreateSession.mockResolvedValue("mock-session-id");
    mockDeleteSession.mockResolvedValue(undefined);
    mockBuildRound1Prompt.mockReset();
    mockBuildRoundNPrompt.mockReset();

    mockCallAgent.mockImplementation((_sessionId: string, agent: AgentConfig, _prompt: unknown, round: number) =>
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

    mockCallVote.mockImplementation((_sessionId: string, agent: AgentConfig) =>
      Promise.resolve({
        role: agent.role,
        model: agent.model,
        timestamp: new Date().toISOString(),
        chosen_position: "best position",
        rationale: "reasoning",
        confidence: 0.8,
      }),
    );

    onProgressMock = vi.fn();

    controller = new DebateController({
      store,
      opencodeUrl: "http://127.0.0.1:4096",
      directory: "/tmp/agora-test",
      retryOpts: { maxAttempts: 1, baseDelayMs: 1 },
      timeoutMs: 500,
      onProgress: onProgressMock as unknown as (event: ProgressEvent) => void,
    });
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  // ─── Test 1: injectGuidance adds guidance to store (unconsumed) ───────────

  it("injectGuidance: adds guidance to store with consumed=false", async () => {
    // Setup: save a topic so the store has a topic dir
    await store.saveTopic({
      id: "topic-g1",
      question: "Test?",
      status: "running",
      config: { max_rounds: 3, consensus_threshold: 0.66, agents },
      created_at: new Date().toISOString(),
    });

    await controller.injectGuidance("topic-g1", "Focus on equity impacts.");

    const pending = await store.getPendingGuidance("topic-g1");
    expect(pending).toHaveLength(1);
    expect(pending[0]!.content).toBe("Focus on equity impacts.");
    expect(pending[0]!.consumed).toBe(false);
  });

  // ─── Test 2: injectGuidance emits "guidance_added" ProgressEvent ─────────

  it("injectGuidance: emits guidance_added ProgressEvent", async () => {
    await store.saveTopic({
      id: "topic-g2",
      question: "Test?",
      status: "running",
      config: { max_rounds: 3, consensus_threshold: 0.66, agents },
      created_at: new Date().toISOString(),
    });

    await controller.injectGuidance("topic-g2", "Consider London case study.");

    const guidanceAddedEvent = onProgressMock.mock.calls
      .map((call) => call[0])
      .find((e) => e.type === "guidance_added");

    expect(guidanceAddedEvent).toBeDefined();
    expect(guidanceAddedEvent.topic_id).toBe("topic-g2");
    expect(guidanceAddedEvent.guidance.content).toBe("Consider London case study.");
    expect(typeof guidanceAddedEvent.timestamp).toBe("string");
  });

  // ─── Test 3: injectGuidance with pinToBlackboard=true creates BlackboardItem + emits "blackboard_updated" ───

  it("injectGuidance: when pinToBlackboard=true creates BlackboardItem and emits blackboard_updated", async () => {
    await store.saveTopic({
      id: "topic-g3",
      question: "Test?",
      status: "running",
      config: { max_rounds: 3, consensus_threshold: 0.66, agents },
      created_at: new Date().toISOString(),
    });

    await controller.injectGuidance("topic-g3", "Key constraint: budget under $5M.", {
      pinToBlackboard: true,
    });

    // Check blackboard item was created
    const blackboard = await store.getBlackboard("topic-g3");
    expect(blackboard).toHaveLength(1);
    expect(blackboard[0]!.content).toBe("Key constraint: budget under $5M.");
    expect(blackboard[0]!.type).toBe("guidance");
    expect(blackboard[0]!.pinned).toBe(true);
    expect(blackboard[0]!.author).toBe("human");

    // Check blackboard_updated event was emitted
    const blackboardUpdatedEvent = onProgressMock.mock.calls
      .map((call) => call[0])
      .find((e) => e.type === "blackboard_updated");

    expect(blackboardUpdatedEvent).toBeDefined();
    expect(blackboardUpdatedEvent.topic_id).toBe("topic-g3");
    expect(blackboardUpdatedEvent.item.content).toBe("Key constraint: budget under $5M.");
  });

  // ─── Test 4: injectGuidance with pinToBlackboard=false → no blackboard item ──

  it("injectGuidance: when pinToBlackboard=false no blackboard item created", async () => {
    await store.saveTopic({
      id: "topic-g4",
      question: "Test?",
      status: "running",
      config: { max_rounds: 3, consensus_threshold: 0.66, agents },
      created_at: new Date().toISOString(),
    });

    await controller.injectGuidance("topic-g4", "Just a guidance, no pin.", {
      pinToBlackboard: false,
    });

    const blackboard = await store.getBlackboard("topic-g4");
    expect(blackboard).toHaveLength(0);

    // Also confirm no blackboard_updated event
    const blackboardUpdatedEvent = onProgressMock.mock.calls
      .map((call) => call[0])
      .find((e) => e.type === "blackboard_updated");
    expect(blackboardUpdatedEvent).toBeUndefined();
  });

  // ─── Test 5: injectGuidance target_round and target_agents stored correctly ──

  it("injectGuidance: target_round and target_agents stored correctly", async () => {
    await store.saveTopic({
      id: "topic-g5",
      question: "Test?",
      status: "running",
      config: { max_rounds: 3, consensus_threshold: 0.66, agents },
      created_at: new Date().toISOString(),
    });

    await controller.injectGuidance("topic-g5", "Round 2 economists only.", {
      targetRound: 2,
      targetAgents: ["economist"],
    });

    const pending = await store.getPendingGuidance("topic-g5");
    expect(pending).toHaveLength(1);
    expect(pending[0]!.target_round).toBe(2);
    expect(pending[0]!.target_agents).toEqual(["economist"]);
  });

  // ─── Test 6: consumeTargetedGuidance marks guidance consumed after targeted agent posts ──

  it("consumeTargetedGuidance: guidance for specific agent is marked consumed after that agent posts", async () => {
    const topicId = "topic-g6";

    await store.saveTopic({
      id: topicId,
      question: "Test?",
      status: "running",
      config: { max_rounds: 3, consensus_threshold: 0.66, agents },
      created_at: new Date().toISOString(),
    });

    // Inject guidance targeting only "economist"
    await controller.injectGuidance(topicId, "Economist-specific guidance.", {
      targetAgents: ["economist"],
    });

    // Verify it's unconsumed initially
    const beforeDebate = await store.getPendingGuidance(topicId);
    expect(beforeDebate).toHaveLength(1);
    expect(beforeDebate[0]!.consumed).toBe(false);

    // Run the debate with enableGuidance
    await controller.runDebate({
      topicId,
      question: "Test?",
      agents,
      enableGuidance: true,
    });

    // After round 1, the economist agent posted → guidance should be consumed
    // getPendingGuidance only returns unconsumed, so it should now be empty
    const afterDebate = await store.getPendingGuidance(topicId);
    expect(afterDebate).toHaveLength(0);
  });

  // ─── Test 7: guidance without target_agents is NOT consumed by targeted consumption ──

  it("consumeTargetedGuidance: guidance without target_agents is NOT consumed by targeted consumption", async () => {
    const topicId = "topic-g7";

    await store.saveTopic({
      id: topicId,
      question: "Test?",
      status: "running",
      config: { max_rounds: 3, consensus_threshold: 0.66, agents },
      created_at: new Date().toISOString(),
    });

    // Inject guidance with NO target_agents (global guidance)
    await controller.injectGuidance(topicId, "Global guidance for everyone.", {
      // no targetAgents
    });

    // Run the debate with enableGuidance
    await controller.runDebate({
      topicId,
      question: "Test?",
      agents,
      enableGuidance: true,
    });

    // Global guidance should remain unconsumed after targeted consumption
    // (consumeTargetedGuidance only marks guidance that has target_agents set)
    const allGuidanceFiles = await store.getPendingGuidance(topicId);
    expect(allGuidanceFiles).toHaveLength(1);
    expect(allGuidanceFiles[0]!.consumed).toBe(false);
  });

  // ─── Test 8: Guidance injected mid-debate appears in round 2 prompts ──────

  it("Guidance injected mid-debate appears in round 2 prompts", async () => {
    const topicId = "topic-g8";

    await store.saveTopic({
      id: topicId,
      question: "Test?",
      status: "running",
      config: { max_rounds: 3, consensus_threshold: 0.66, agents },
      created_at: new Date().toISOString(),
    });

    let round1AgentsDone = 0;
    mockCallAgent.mockImplementation(async (_sessionId: string, agent: AgentConfig, _prompt: unknown, round: number) => {
      if (round === 1) {
        round1AgentsDone++;
        if (round1AgentsDone === agents.length) {
          // Inject guidance AFTER round 1 agents complete
          await controller.injectGuidance(topicId, "Mid-debate: focus on fiscal impacts.", {
            targetRound: 2,
          });
        }
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

    await controller.runDebate({
      topicId,
      question: "Test?",
      agents,
      enableGuidance: true,
    });

    // Round 2 prompts should have included the guidance
    const round2Calls = mockBuildRoundNPrompt.mock.calls.filter(
      (call) => call[0]?.round === 2
    );
    expect(round2Calls.length).toBeGreaterThan(0);
    const anyRound2HasGuidance = round2Calls.some((call) =>
      call[0]?.guidance?.some((g: { content: string }) => g.content === "Mid-debate: focus on fiscal impacts.")
    );
    expect(anyRound2HasGuidance).toBe(true);
  });

  // ─── Test 9: runDebate with enableGuidance: getPendingGuidance called each round ──

  it("runDebate with enableGuidance: getPendingGuidance called for each round", async () => {
    const topicId = "topic-g9";

    const getPendingGuidanceSpy = vi.spyOn(store, "getPendingGuidance");

    await controller.runDebate({
      topicId,
      question: "Should we adopt congestion pricing?",
      agents,
      enableGuidance: true,
    });

    // 3 rounds total → getPendingGuidance called once per round
    const roundCalls = getPendingGuidanceSpy.mock.calls.filter(
      (call) => call[0] === topicId
    );
    expect(roundCalls.length).toBeGreaterThanOrEqual(3);
  });

  // ─── Test 10: runDebate with enableGuidance: guidance passed to prompt builders ──

  it("runDebate with enableGuidance: guidance passed to buildRound1Prompt and buildRoundNPrompt", async () => {
    const topicId = "topic-g10";

    // Pre-inject guidance before debate starts
    await store.saveTopic({
      id: topicId,
      question: "Should we adopt congestion pricing?",
      status: "pending",
      config: { max_rounds: 3, consensus_threshold: 0.66, agents },
      created_at: new Date().toISOString(),
    });

    await controller.injectGuidance(topicId, "Consider equity impacts throughout all rounds.");

    await controller.runDebate({
      topicId,
      question: "Should we adopt congestion pricing?",
      agents,
      enableGuidance: true,
    });

    // Round 1 prompt builder should have received the guidance array
    expect(mockBuildRound1Prompt).toHaveBeenCalled();
    const round1Call = mockBuildRound1Prompt.mock.calls[0]?.[0];
    expect(round1Call).toBeDefined();
    expect(round1Call.guidance).toBeDefined();
    expect(Array.isArray(round1Call.guidance)).toBe(true);
    // The guidance content should be present in the first call
    const hasGuidanceContent = round1Call.guidance.some(
      (g: { content: string }) => g.content === "Consider equity impacts throughout all rounds."
    );
    expect(hasGuidanceContent).toBe(true);

    // Round N prompt builder should have been called (rounds 2 and 3)
    expect(mockBuildRoundNPrompt).toHaveBeenCalled();
    const round2Call = mockBuildRoundNPrompt.mock.calls[0]?.[0];
    expect(round2Call).toBeDefined();
    expect(round2Call.guidance).toBeDefined();
    expect(Array.isArray(round2Call.guidance)).toBe(true);
  });
});
