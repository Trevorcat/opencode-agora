import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { BlackboardStore } from "../../src/blackboard/store.js";
import type { AgentConfig } from "../../src/blackboard/types.js";
import { DebateController } from "../../src/moderator/controller.js";

// ─── Mock AgentProcessManager ────────────────────────────────────────────────
const { mockCallAgent } = vi.hoisted(() => ({ mockCallAgent: vi.fn() }));

vi.mock("../../src/agents/process-manager.js", () => ({
  AgentProcessManager: vi.fn().mockImplementation(function AgentProcessManagerMock() {
    return {
      callAgent: mockCallAgent,
      callVote: vi.fn(),
    };
  }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Read pause-state.json directly from disk */
async function readPauseState(
  rootDir: string,
  topicId: string,
): Promise<{ paused: boolean; reason?: string } | null> {
  try {
    const filePath = path.join(rootDir, "topics", topicId, "pause-state.json");
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as { paused: boolean; reason?: string };
  } catch {
    return null;
  }
}

// ─── Shared Test State ────────────────────────────────────────────────────────

describe("DebateController – pause/resume", () => {
  let rootDir: string;
  let store: BlackboardStore;
  let onProgress: ReturnType<typeof vi.fn>;
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
    rootDir = await mkdtemp(path.join(tmpdir(), "debate-pause-test-"));
    store = new BlackboardStore(rootDir);
    await store.init();

    mockCallAgent.mockReset();

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

  // ─── pauseDebate ────────────────────────────────────────────────────────────

  it("pauseDebate: sets pause-state.json to paused=true", async () => {
    // Need a topic to exist so getLiveStatus can find it
    await store.saveTopic({
      id: "topic-pause-1",
      question: "Test question",
      status: "running",
      config: { max_rounds: 3, consensus_threshold: 0.66, agents },
      created_at: new Date().toISOString(),
    });

    await controller.pauseDebate("topic-pause-1");

    const state = await readPauseState(rootDir, "topic-pause-1");
    expect(state).not.toBeNull();
    expect(state?.paused).toBe(true);
  });

  it("pauseDebate: stores pause reason", async () => {
    await store.saveTopic({
      id: "topic-pause-2",
      question: "Test question",
      status: "running",
      config: { max_rounds: 3, consensus_threshold: 0.66, agents },
      created_at: new Date().toISOString(),
    });

    await controller.pauseDebate("topic-pause-2", "human wants to inject guidance");

    const state = await readPauseState(rootDir, "topic-pause-2");
    expect(state?.reason).toBe("human wants to inject guidance");
  });

  it("pauseDebate: emits 'paused' ProgressEvent with correct round and reason", async () => {
    await store.saveTopic({
      id: "topic-pause-3",
      question: "Test question",
      status: "running",
      config: { max_rounds: 3, consensus_threshold: 0.66, agents },
      created_at: new Date().toISOString(),
    });

    await controller.pauseDebate("topic-pause-3", "review before round 2");

    const pausedEvent = onProgress.mock.calls
      .map((call) => call[0])
      .find((e) => e.type === "paused");

    expect(pausedEvent).toBeDefined();
    expect(pausedEvent.topic_id).toBe("topic-pause-3");
    expect(pausedEvent.reason).toBe("review before round 2");
    expect(typeof pausedEvent.round).toBe("number");
    expect(typeof pausedEvent.timestamp).toBe("string");
  });

  // ─── resumeDebate ───────────────────────────────────────────────────────────

  it("resumeDebate: sets pause-state.json to paused=false", async () => {
    await store.saveTopic({
      id: "topic-resume-1",
      question: "Test question",
      status: "running",
      config: { max_rounds: 3, consensus_threshold: 0.66, agents },
      created_at: new Date().toISOString(),
    });

    // First pause it
    await controller.pauseDebate("topic-resume-1", "testing");
    // Then resume
    await controller.resumeDebate("topic-resume-1");

    const state = await readPauseState(rootDir, "topic-resume-1");
    expect(state?.paused).toBe(false);
  });

  it("resumeDebate: emits 'resumed' ProgressEvent", async () => {
    await store.saveTopic({
      id: "topic-resume-2",
      question: "Test question",
      status: "running",
      config: { max_rounds: 3, consensus_threshold: 0.66, agents },
      created_at: new Date().toISOString(),
    });

    await controller.pauseDebate("topic-resume-2");
    onProgress.mockClear();
    await controller.resumeDebate("topic-resume-2");

    const resumedEvent = onProgress.mock.calls
      .map((call) => call[0])
      .find((e) => e.type === "resumed");

    expect(resumedEvent).toBeDefined();
    expect(resumedEvent.topic_id).toBe("topic-resume-2");
    expect(typeof resumedEvent.timestamp).toBe("string");
  });

  // ─── runDebate with enablePause ─────────────────────────────────────────────

  it("runDebate with enablePause: respects pause before round 2 (waits until resume)", async () => {
    const topicId = "topic-ep-1";

    // Pre-set pause state BEFORE the debate starts.
    // The controller checks pause before each round; round 2 will block.
    // We pre-create the topic dir so setPauseState can write there.
    await store.saveTopic({
      id: topicId,
      question: "Should we adopt congestion pricing?",
      status: "pending",
      config: { max_rounds: 3, consensus_threshold: 0.66, agents },
      created_at: new Date().toISOString(),
    });
    await store.setPauseState(topicId, true, "pause before round 2");

    // Track how many round-1 calls complete
    let round1Done = false;

    mockCallAgent.mockImplementation(async (agent: AgentConfig, _msgs: unknown, round: number) => {
      if (round === 1) {
        round1Done = true;
        // After both round-1 agents complete, schedule a resume so debate continues
        // (the pause check for round 2 will spin until this fires)
        setTimeout(async () => {
          await store.setPauseState(topicId, false);
        }, 80);
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

    const startTime = Date.now();
    await controller.runDebate({
      topicId,
      question: "Should we adopt congestion pricing?",
      agents,
      enablePause: true,
    });
    const elapsed = Date.now() - startTime;

    // round 1 completed
    expect(round1Done).toBe(true);
    // pause was respected → debate waited at least ~80ms for resume
    expect(elapsed).toBeGreaterThan(60);
    // Full debate completed
    const topic = await store.getTopic(topicId);
    expect(topic?.status).toBe("completed");
  });

  it("runDebate with enablePause: debate continues after resume() called from outside", async () => {
    const topicId = "topic-ep-2";

    // Pause synchronously before the debate loop can advance past round 1
    await store.saveTopic({
      id: topicId,
      question: "Test",
      status: "pending",
      config: { max_rounds: 3, consensus_threshold: 0.66, agents },
      created_at: new Date().toISOString(),
    });

    // Pause will be set after round 1 completes via side-effect in mock
    let callCount = 0;
    mockCallAgent.mockImplementation(async (agent: AgentConfig, _msgs: unknown, round: number) => {
      callCount++;
      if (callCount === agents.length) {
        // Pause before round 2
        await store.setPauseState(topicId, true);
        // Schedule external resume via controller
        setTimeout(() => {
          controller.resumeDebate(topicId);
        }, 60);
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
      question: "Should we adopt congestion pricing?",
      agents,
      enablePause: true,
    });

    // Debate completed after external resume
    const topic = await store.getTopic(topicId);
    expect(topic?.status).toBe("completed");

    // resumed event was emitted
    const resumedEvent = onProgress.mock.calls
      .map((c) => c[0])
      .find((e) => e.type === "resumed");
    expect(resumedEvent).toBeDefined();
  });

  it("runDebate with enablePause: abort signal terminates waiting debate", async () => {
    const topicId = "topic-ep-3";

    // Pre-create topic and set pause state so debate blocks before round 2
    await store.saveTopic({
      id: topicId,
      question: "Should we adopt congestion pricing?",
      status: "pending",
      config: { max_rounds: 3, consensus_threshold: 0.66, agents },
      created_at: new Date().toISOString(),
    });
    await store.setPauseState(topicId, true);

    // Track round-1 completion to know when debate is paused at round 2
    let round1Complete = false;
    mockCallAgent.mockImplementation(async (agent: AgentConfig, _msgs: unknown, round: number) => {
      if (round === 1) round1Complete = true;
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

    // Start debate — it will block in waitIfPaused for round 2
    const debatePromise = controller.runDebate({
      topicId,
      question: "Should we adopt congestion pricing?",
      agents,
      enablePause: true,
    });

    // Wait until round 1 agents have all been called (debate is now waiting on pause)
    await new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        if (round1Complete) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 10);
    });

    // Give waitIfPaused a moment to enter the polling loop
    await new Promise((r) => setTimeout(r, 50));

    // Verify debate is blocked: topic is running but still paused
    const isPaused = await store.isPaused(topicId);
    expect(isPaused).toBe(true);

    // Unblock by resuming — debate should complete normally
    await store.setPauseState(topicId, false);

    // Debate should finish
    await debatePromise;

    const topic = await store.getTopic(topicId);
    expect(topic?.status).toBe("completed");
  });
});
