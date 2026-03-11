import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { BlackboardStore } from "../../src/blackboard/store.js";
import type { AgentConfig } from "../../src/blackboard/types.js";
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

describe("DebateController – runDebateAsync", () => {
  let rootDir: string;
  let store: BlackboardStore;
  let controller: DebateController;

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), "debate-async-test-"));
    store = new BlackboardStore(rootDir);
    await store.init();

    mockCallAgent.mockReset();
    mockCallVote.mockReset();
    mockCreateSession.mockReset();
    mockDeleteSession.mockReset();
    mockCreateSession.mockResolvedValue("mock-session-id");
    mockDeleteSession.mockResolvedValue(undefined);

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

    controller = new DebateController({
      store,
      opencodeUrl: "http://127.0.0.1:4096",
      directory: "/tmp/agora-test",
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

  // ─── Test 1: returns immediately with { topicId, promise, abort } ────────────

  it("runDebateAsync: returns immediately with { topicId, promise, abort }", () => {
    const result = controller.runDebateAsync({
      topicId: "topic-async-1",
      question: "Should we adopt congestion pricing?",
      agents,
    });

    expect(result).toBeDefined();
    expect(result.topicId).toBe("topic-async-1");
    expect(result.promise).toBeInstanceOf(Promise);
    expect(typeof result.abort).toBe("function");

    // Must not block — return is synchronous
    // (If this test reaches here, it returned immediately)

    // Clean up: wait for promise to settle
    return result.promise;
  });

  // ─── Test 2: promise resolves after debate completes ─────────────────────────

  it("runDebateAsync: promise resolves after debate completes", async () => {
    const result = controller.runDebateAsync({
      topicId: "topic-async-2",
      question: "Should we adopt congestion pricing?",
      agents,
    });

    // Promise should resolve (not reject) when debate completes successfully
    await expect(result.promise).resolves.toBeUndefined();

    // Debate should have stored completed status
    const topic = await store.getTopic("topic-async-2");
    expect(topic?.status).toBe("completed");
  });

  // ─── Test 3: debate runs with enablePause=true by default ────────────────────

  it("runDebateAsync: debate runs with enablePause=true by default", async () => {
    const getPendingGuidanceSpy = vi.spyOn(store, "isPaused");

    const result = controller.runDebateAsync({
      topicId: "topic-async-3",
      question: "Should we adopt congestion pricing?",
      agents,
      // enablePause NOT passed explicitly — should default to true in async mode
    });

    await result.promise;

    // isPaused should have been called (it's called by waitIfPaused when enablePause=true)
    expect(getPendingGuidanceSpy).toHaveBeenCalled();
  });

  // ─── Test 4: debate runs with enableGuidance=true by default ─────────────────

  it("runDebateAsync: debate runs with enableGuidance=true by default", async () => {
    const getPendingGuidanceSpy = vi.spyOn(store, "getPendingGuidance");

    const result = controller.runDebateAsync({
      topicId: "topic-async-4",
      question: "Should we adopt congestion pricing?",
      agents,
      // enableGuidance NOT passed explicitly — should default to true in async mode
    });

    await result.promise;

    // getPendingGuidance should have been called at least once per round (3 rounds)
    const calls = getPendingGuidanceSpy.mock.calls.filter(
      (call) => call[0] === "topic-async-4",
    );
    expect(calls.length).toBeGreaterThanOrEqual(3);
  });

  // ─── Test 5: abort() terminates the debate gracefully ────────────────────────

  it("runDebateAsync: abort() terminates the debate gracefully", async () => {
    const topicId = "topic-async-5";

    // Block debate at round 2 by pausing after round 1 completes
    let round1AgentsDone = 0;
    let abortCalledAt = 0;

    mockCallAgent.mockImplementation(async (_sessionId: string, agent: AgentConfig, _prompt: unknown, round: number) => {
      if (round === 1) {
        round1AgentsDone++;
        if (round1AgentsDone === agents.length) {
          // Pause to block between round 1 and round 2
          await store.setPauseState(topicId, true, "holding for abort test");
          // Schedule abort after pause is set
          setTimeout(() => {
            abortCalledAt = Date.now();
            result.abort();
            // Resume the pause so the abort check can run
            store.setPauseState(topicId, false);
          }, 50);
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

    const result = controller.runDebateAsync({
      topicId,
      question: "Should we adopt congestion pricing?",
      agents,
    });

    // Wait for promise to settle (abort should cause it to resolve/reject gracefully)
    await result.promise;

    // abort() was called
    expect(abortCalledAt).toBeGreaterThan(0);
  });

  // ─── Test 6: aborted debate does not throw (swallowed "Debate aborted") ──────

  it("runDebateAsync: aborted debate does not throw (swallowed 'Debate aborted')", async () => {
    const topicId = "topic-async-6";

    let round1AgentsDone = 0;

    mockCallAgent.mockImplementation(async (_sessionId: string, agent: AgentConfig, _prompt: unknown, round: number) => {
      if (round === 1) {
        round1AgentsDone++;
        if (round1AgentsDone === agents.length) {
          // Pause and schedule abort
          await store.setPauseState(topicId, true);
          setTimeout(() => {
            result.abort();
            store.setPauseState(topicId, false);
          }, 50);
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

    const result = controller.runDebateAsync({
      topicId,
      question: "Should we adopt congestion pricing?",
      agents,
    });

    // The promise must resolve (not reject) — "Debate aborted" error is swallowed
    await expect(result.promise).resolves.toBeUndefined();
  });

  // ─── Test 7: topic status appropriate after abort ─────────────────────────────

  it("runDebateAsync: topic status appropriate after abort", async () => {
    const topicId = "topic-async-7";

    let round1AgentsDone = 0;

    mockCallAgent.mockImplementation(async (_sessionId: string, agent: AgentConfig, _prompt: unknown, round: number) => {
      if (round === 1) {
        round1AgentsDone++;
        if (round1AgentsDone === agents.length) {
          await store.setPauseState(topicId, true);
          setTimeout(() => {
            result.abort();
            store.setPauseState(topicId, false);
          }, 50);
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

    const result = controller.runDebateAsync({
      topicId,
      question: "Should we adopt congestion pricing?",
      agents,
    });

    await result.promise;

    const topic = await store.getTopic(topicId);
    // After abort, the topic should be in a terminal state — either "failed" or a custom "aborted" status.
    // The existing code sets "failed" for any thrown error, so "failed" is acceptable,
    // OR the implementation could be enhanced to use "aborted". We accept either.
    expect(["failed", "aborted"]).toContain(topic?.status);
  });
});
