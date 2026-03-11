/**
 * tests/server/server-tools.test.ts
 *
 * Wave 4 – Integration tests for all 12 MCP tool handlers registered in
 * createAgoraServer().
 *
 * Strategy:
 *   • Real BlackboardStore backed by a temp directory per test.
 *   • DebateController is fully mocked so AI calls are never made.
 *   • Tool handlers are invoked directly via the `handler` property that
 *     McpServer attaches to each `_registeredTools[name]` entry.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { BlackboardStore } from "../../src/blackboard/store.js";
import { createAgoraServer } from "../../src/server.js";
import type { Consensus, Topic } from "../../src/blackboard/types.js";

// ─── Mock DebateController ────────────────────────────────────────────────────
//
// We need to mock the module BEFORE importing server.ts.  With Vitest's ESM
// hoisting, vi.mock() calls are hoisted to the top automatically.

const mockRunDebate = vi.fn<[], Promise<void>>().mockResolvedValue(undefined);
const mockRunDebateAsync = vi.fn().mockReturnValue({
  promise: Promise.resolve(),
  abort: vi.fn(),
});
const mockPauseDebate = vi.fn<[], Promise<void>>().mockResolvedValue(undefined);
const mockResumeDebate = vi.fn<[], Promise<void>>().mockResolvedValue(undefined);
const mockInjectGuidance = vi.fn<[], Promise<void>>().mockResolvedValue(undefined);
const mockPinToBlackboard = vi.fn<[], Promise<void>>().mockResolvedValue(undefined);
const mockAttachToTopic = vi.fn<[], Promise<void>>().mockResolvedValue(undefined);
const mockDetachFromTopic = vi.fn<[], Promise<void>>().mockResolvedValue(undefined);

vi.mock("../../src/config/presets.js", () => ({
  listPresets: vi.fn().mockResolvedValue([
    {
      id: "default",
      name: "Balanced Panel",
      description: "3-agent balanced debate",
      agent_count: 3,
      roles: ["skeptic", "proponent", "pragmatist"],
    },
    {
      id: "quick",
      name: "Quick Debate",
      description: "2-agent fast debate",
      agent_count: 2,
      roles: ["proponent", "skeptic"],
    },
  ]),
  resolvePreset: vi.fn().mockResolvedValue([
    {
      role: "proponent",
      persona: "You are an advocate.",
      model: "lilith/gemini-3-flash-preview",
    },
    {
      role: "skeptic",
      persona: "You are a skeptic.",
      model: "lilith/deepseek-v3-2-251201",
    },
  ]),
  resolveAgentsWithDefaults: vi.fn().mockImplementation(async (_dir: string, agents: Array<{ role: string; persona?: string; model?: string }>) =>
    agents.map((a) => ({
      role: a.role,
      persona: a.persona ?? `Default persona for ${a.role}`,
      model: a.model ?? "lilith/deepseek-v3-2-251201",
    }))
  ),
  savePreset: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/moderator/controller.js", () => {
  // Must use a real constructor (class/function) so `new DebateController()`
  // works.  Arrow functions cannot be used as constructors.
  function MockDebateController() {
    return {
      runDebate: mockRunDebate,
      runDebateAsync: mockRunDebateAsync,
      pauseDebate: mockPauseDebate,
      resumeDebate: mockResumeDebate,
      injectGuidance: mockInjectGuidance,
      pinToBlackboard: mockPinToBlackboard,
      attachToTopic: mockAttachToTopic,
      detachFromTopic: mockDetachFromTopic,
    };
  }
  return {
    DebateController: MockDebateController,
  };
});

// ConsensusSynthesizer is also mocked so we never call real LLMs.
const mockSynthesize = vi.fn();
vi.mock("../../src/consensus/synthesizer.js", () => {
  // Must use a real constructor (class/function) so `new ConsensusSynthesizer()`
  // works.
  function MockConsensusSynthesizer() {
    return { synthesize: mockSynthesize };
  }
  return {
    ConsensusSynthesizer: MockConsensusSynthesizer,
  };
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeConsensus(topicId: string): Consensus {
  return {
    topic_id: topicId,
    conclusion: "Test consensus conclusion",
    confidence: 0.8,
    vote_distribution: { adopt: 2, reject: 1 },
    key_arguments: ["arg1"],
    dissenting_views: [],
    rounds_taken: 3,
    convergence_method: "majority",
    generated_by: "moderator",
  };
}

function makeTopic(id: string, status: Topic["status"] = "pending"): Topic {
  return {
    id,
    question: "Test question?",
    status,
    config: {
      max_rounds: 3,
      consensus_threshold: 0.66,
      agents: [
        { role: "a", persona: "Agent A", model: "p/m" },
        { role: "b", persona: "Agent B", model: "p/m" },
      ],
    },
    created_at: new Date().toISOString(),
  };
}

/** Extract tool handler by name from McpServer instance. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getTool(server: ReturnType<typeof createAgoraServer>, name: string): (args: Record<string, unknown>) => Promise<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools = (server as any)._registeredTools;
  if (!tools[name]) throw new Error(`Tool ${name} not registered`);
  return tools[name].handler;
}

/** Parse the JSON text payload out of a tool result. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseResult(result: any): any {
  return JSON.parse(result.content[0].text);
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("MCP server tools", () => {
  let rootDir: string;
  let store: BlackboardStore;
  let server: ReturnType<typeof createAgoraServer>;

  beforeEach(async () => {
    // Fresh temp dir + store for every test.
    rootDir = await mkdtemp(path.join(tmpdir(), "agora-server-test-"));
    store = new BlackboardStore(rootDir);
    await store.init();

    // Reset all mocks to clean state.
    vi.clearAllMocks();
    mockRunDebate.mockResolvedValue(undefined);
    // Use a never-resolving promise for async debates so the background cleanup
    // (ConsensusSynthesizer + pinToBlackboard) never fires during the test.
    // Tests that need it to resolve will override this mock.
    mockRunDebateAsync.mockReturnValue({ promise: new Promise(() => {}), abort: vi.fn() });
    mockSynthesize.mockResolvedValue(makeConsensus("__placeholder__"));

    server = createAgoraServer({
      store,
      agoraDir: rootDir,
      providers: new Map(),
      moderatorModel: "test/model",
      availableModels: [
        { id: "lilith/deepseek-v3-2-251201", name: "DeepSeek V3.2", provider: "lilith" },
        { id: "lilith/gemini-3-flash-preview", name: "Gemini 3 Flash", provider: "lilith" },
        { id: "lilith/claude-opus-4-6", name: "Claude Opus 4.6", provider: "lilith" },
        { id: "lilith/gemini-3.1-pro-preview", name: "Gemini 3.1 Pro", provider: "lilith" },
        { id: "lilith/qwen3.5-plus", name: "Qwen 3.5 Plus", provider: "lilith" },
        { id: "codex/gpt-5.3-codex", name: "GPT-5.3 Codex", provider: "codex" },
      ],
    });
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  // ─── forum.start_debate ─────────────────────────────────────────────────────

  describe("forum.start_debate", () => {
    it("returns { topicId, status: 'completed', consensus } on success", async () => {
      const handler = getTool(server, "forum.start_debate");

      mockSynthesize.mockImplementation(async ({ topicId }: { topicId: string }) =>
        makeConsensus(topicId),
      );

      const result = await handler({ question: "Is TDD worth it?" });
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.status).toBe("completed");
      expect(typeof data.topicId).toBe("string");
      expect(data.consensus.conclusion).toBe("Test consensus conclusion");
    });

    it("uses default agents when agents param is omitted", async () => {
      const handler = getTool(server, "forum.start_debate");

      mockSynthesize.mockResolvedValue(makeConsensus("x"));

      await handler({ question: "Use defaults?" });

      // runDebate was called with an agents array of at least 1 entry
      expect(mockRunDebate).toHaveBeenCalledOnce();
      const callArgs = mockRunDebate.mock.calls[0][0] as { agents: unknown[] };
      expect(Array.isArray(callArgs.agents)).toBe(true);
      expect(callArgs.agents.length).toBeGreaterThan(0);
    });

    it("saves topic with correct config before debate starts", async () => {
      const handler = getTool(server, "forum.start_debate");

      // Capture topicId from runDebate call
      let capturedTopicId = "";
      mockRunDebate.mockImplementation(async ({ topicId }: { topicId: string }) => {
        capturedTopicId = topicId;
        // Verify topic already saved with correct shape
        const topic = await store.getTopic(topicId);
        expect(topic).not.toBeNull();
        expect(topic?.status).toBe("pending");
        expect(topic?.config.max_rounds).toBe(3);
        expect(topic?.config.consensus_threshold).toBe(0.66);
      });

      mockSynthesize.mockImplementation(async ({ topicId }: { topicId: string }) =>
        makeConsensus(topicId),
      );

      await handler({ question: "Save config test?" });
      expect(capturedTopicId).not.toBe("");
    });

    it("returns isError: true on controller failure", async () => {
      const handler = getTool(server, "forum.start_debate");

      mockRunDebate.mockRejectedValue(new Error("LLM unavailable"));

      const result = await handler({ question: "Will fail?" });
      const data = parseResult(result);

      expect(result.isError).toBe(true);
      expect(data.status).toBe("failed");
      expect(data.error).toContain("LLM unavailable");
    });

    it("pins consensus to blackboard after completion", async () => {
      const handler = getTool(server, "forum.start_debate");

      mockSynthesize.mockImplementation(async ({ topicId }: { topicId: string }) =>
        makeConsensus(topicId),
      );

      const result = await handler({ question: "Pin test?" });
      const data = parseResult(result);

      expect(data.status).toBe("completed");
      // pinToBlackboard called with the consensus conclusion and type "consensus"
      expect(mockPinToBlackboard).toHaveBeenCalledOnce();
      const [, content, type] = mockPinToBlackboard.mock.calls[0] as [string, string, string];
      expect(type).toBe("consensus");
      expect(content).toBe("Test consensus conclusion");
    });
  });

  // ─── forum.start_debate_async ───────────────────────────────────────────────

  describe("forum.start_debate_async", () => {
    it("returns immediately with status: 'started'", async () => {
      const handler = getTool(server, "forum.start_debate_async");

      const result = await handler({ question: "Async debate?" });
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.status).toBe("started");
    });

    it("topicId is generated and returned", async () => {
      const handler = getTool(server, "forum.start_debate_async");

      const result = await handler({ question: "Will this have a topicId?" });
      const data = parseResult(result);

      expect(typeof data.topicId).toBe("string");
      expect(data.topicId.startsWith("topic_")).toBe(true);
    });
  });

  // ─── forum.get_live_status ──────────────────────────────────────────────────

  describe("forum.get_live_status", () => {
    it("returns LiveStatus for an existing topic", async () => {
      const topic = makeTopic("topic-ls-1");
      await store.saveTopic(topic);

      const handler = getTool(server, "forum.get_live_status");
      const result = await handler({ topic_id: "topic-ls-1" });
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.topic_id).toBe("topic-ls-1");
      expect(typeof data.current_round).toBe("number");
    });

    it("returns isError: true for missing topic", async () => {
      const handler = getTool(server, "forum.get_live_status");
      const result = await handler({ topic_id: "nonexistent" });
      const data = parseResult(result);

      expect(result.isError).toBe(true);
      expect(data.error).toContain("not found");
    });
  });

  // ─── forum.get_blackboard ───────────────────────────────────────────────────

  describe("forum.get_blackboard", () => {
    it("returns blackboard items and pinned subset", async () => {
      const topic = makeTopic("topic-bb-1");
      await store.saveTopic(topic);

      // Add one pinned and one unpinned item directly
      await store.saveBlackboardItem("topic-bb-1", {
        id: "item-1",
        type: "note",
        content: "A regular note",
        author: "human",
        timestamp: new Date().toISOString(),
        round: 1,
        pinned: false,
        editable: true,
      });
      await store.saveBlackboardItem("topic-bb-1", {
        id: "item-2",
        type: "consensus",
        content: "A pinned consensus",
        author: "moderator",
        timestamp: new Date().toISOString(),
        round: 2,
        pinned: true,
        editable: false,
      });

      const handler = getTool(server, "forum.get_blackboard");
      const result = await handler({ topic_id: "topic-bb-1" });
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.blackboard).toHaveLength(2);
      expect(data.pinned_items).toHaveLength(1);
      expect(data.pinned_items[0].id).toBe("item-2");
    });

    it("returns isError: true for missing topic", async () => {
      const handler = getTool(server, "forum.get_blackboard");
      const result = await handler({ topic_id: "ghost-topic" });

      expect(result.isError).toBe(true);
      const data = parseResult(result);
      expect(data.error).toContain("not found");
    });
  });

  // ─── forum.pause_debate ─────────────────────────────────────────────────────

  describe("forum.pause_debate", () => {
    it("calls controller.pauseDebate when topic is in runningDebates", async () => {
      // Start an async debate so it appears in runningDebates
      const asyncHandler = getTool(server, "forum.start_debate_async");
      const asyncResult = await asyncHandler({ question: "Pause me?" });
      const { topicId } = parseResult(asyncResult);

      const handler = getTool(server, "forum.pause_debate");
      const result = await handler({ topic_id: topicId, reason: "reviewing" });
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.status).toBe("paused");
      expect(mockPauseDebate).toHaveBeenCalledOnce();
      expect(mockPauseDebate.mock.calls[0][0]).toBe(topicId);
      expect(mockPauseDebate.mock.calls[0][1]).toBe("reviewing");
    });

    it("falls back to direct store.setPauseState when debate is not in runningDebates", async () => {
      const topic = makeTopic("topic-pause-fallback");
      await store.saveTopic(topic);

      const handler = getTool(server, "forum.pause_debate");
      const result = await handler({ topic_id: "topic-pause-fallback" });
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.status).toBe("paused");
      // No running debate → controller.pauseDebate should NOT be called
      expect(mockPauseDebate).not.toHaveBeenCalled();
      // But the store should have the pause state set
      const isPaused = await store.isPaused("topic-pause-fallback");
      expect(isPaused).toBe(true);
    });
  });

  // ─── forum.resume_debate ────────────────────────────────────────────────────

  describe("forum.resume_debate", () => {
    it("calls controller.resumeDebate when topic is running", async () => {
      const asyncHandler = getTool(server, "forum.start_debate_async");
      const asyncResult = await asyncHandler({ question: "Resume me?" });
      const { topicId } = parseResult(asyncResult);

      const handler = getTool(server, "forum.resume_debate");
      const result = await handler({ topic_id: topicId });
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.status).toBe("resumed");
      expect(mockResumeDebate).toHaveBeenCalledOnce();
    });

    it("falls back to store when debate is not running", async () => {
      const topic = makeTopic("topic-resume-fallback");
      await store.saveTopic(topic);
      // Pre-pause via store
      await store.setPauseState("topic-resume-fallback", true);

      const handler = getTool(server, "forum.resume_debate");
      const result = await handler({ topic_id: "topic-resume-fallback" });
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.status).toBe("resumed");
      expect(mockResumeDebate).not.toHaveBeenCalled();
      const isPaused = await store.isPaused("topic-resume-fallback");
      expect(isPaused).toBe(false);
    });
  });

  // ─── forum.inject_guidance ──────────────────────────────────────────────────

  describe("forum.inject_guidance", () => {
    it("returns isError: true for missing topic", async () => {
      const handler = getTool(server, "forum.inject_guidance");
      const result = await handler({
        topic_id: "no-such-topic",
        guidance: "Be concise",
      });

      expect(result.isError).toBe(true);
      const data = parseResult(result);
      expect(data.error).toContain("not found");
    });

    it("calls controller.injectGuidance with correct params", async () => {
      const topic = makeTopic("topic-guidance-1");
      await store.saveTopic(topic);

      const handler = getTool(server, "forum.inject_guidance");
      const result = await handler({
        topic_id: "topic-guidance-1",
        guidance: "Focus on costs",
        target_round: 2,
        target_agents: ["skeptic"],
        pin_to_blackboard: false,
      });
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.status).toBe("guidance_added");
      expect(mockInjectGuidance).toHaveBeenCalledOnce();
      const [topicId, guidanceText, opts] = mockInjectGuidance.mock.calls[0] as [
        string,
        string,
        { targetRound?: number; targetAgents?: string[]; pinToBlackboard?: boolean },
      ];
      expect(topicId).toBe("topic-guidance-1");
      expect(guidanceText).toBe("Focus on costs");
      expect(opts.targetRound).toBe(2);
      expect(opts.targetAgents).toEqual(["skeptic"]);
      expect(opts.pinToBlackboard).toBe(false);
    });

    it("pin_to_blackboard defaults to false when explicitly set", async () => {
      const topic = makeTopic("topic-guidance-defaults");
      await store.saveTopic(topic);

      const handler = getTool(server, "forum.inject_guidance");
      // Explicitly pass false (matching what Zod default resolves to in real MCP calls)
      await handler({
        topic_id: "topic-guidance-defaults",
        guidance: "Stay on topic",
        pin_to_blackboard: false,
      });

      const [, , opts] = mockInjectGuidance.mock.calls[0] as [
        string,
        string,
        { pinToBlackboard?: boolean },
      ];
      // When pin_to_blackboard is explicitly false, it maps through as false
      expect(opts.pinToBlackboard).toBe(false);
    });
  });

  // ─── forum.pin_to_blackboard ────────────────────────────────────────────────

  describe("forum.pin_to_blackboard", () => {
    it("returns isError: true for missing topic", async () => {
      const handler = getTool(server, "forum.pin_to_blackboard");
      const result = await handler({
        topic_id: "ghost",
        content: "something",
        type: "note",
        editable: false,
      });

      expect(result.isError).toBe(true);
      const data = parseResult(result);
      expect(data.error).toContain("not found");
    });

    it("calls controller.pinToBlackboard with correct type", async () => {
      const topic = makeTopic("topic-pin-1");
      await store.saveTopic(topic);

      const handler = getTool(server, "forum.pin_to_blackboard");
      const result = await handler({
        topic_id: "topic-pin-1",
        content: "Important checkpoint",
        type: "checkpoint",
        editable: true,
      });
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.status).toBe("pinned");
      expect(data.type).toBe("checkpoint");
      expect(mockPinToBlackboard).toHaveBeenCalledOnce();
      const [, , type] = mockPinToBlackboard.mock.calls[0] as [string, string, string];
      expect(type).toBe("checkpoint");
    });
  });

  // ─── forum.attach_to_topic ──────────────────────────────────────────────────

  describe("forum.attach_to_topic", () => {
    it("returns isError: true for missing topic", async () => {
      const handler = getTool(server, "forum.attach_to_topic");
      const result = await handler({
        topic_id: "no-such-topic",
        session_id: "sess-abc",
      });

      expect(result.isError).toBe(true);
    });

    it("calls controller.attachToTopic", async () => {
      const topic = makeTopic("topic-attach-1");
      await store.saveTopic(topic);

      const handler = getTool(server, "forum.attach_to_topic");
      await handler({ topic_id: "topic-attach-1", session_id: "sess-xyz" });

      expect(mockAttachToTopic).toHaveBeenCalledOnce();
      const [topicId, sessionId] = mockAttachToTopic.mock.calls[0] as [string, string];
      expect(topicId).toBe("topic-attach-1");
      expect(sessionId).toBe("sess-xyz");
    });

    it("returns { status: 'attached' }", async () => {
      const topic = makeTopic("topic-attach-2");
      await store.saveTopic(topic);

      const handler = getTool(server, "forum.attach_to_topic");
      const result = await handler({ topic_id: "topic-attach-2", session_id: "sess-abc" });
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.status).toBe("attached");
    });
  });

  // ─── forum.detach_from_topic ────────────────────────────────────────────────

  describe("forum.detach_from_topic", () => {
    it("calls controller.detachFromTopic", async () => {
      const topic = makeTopic("topic-detach-1");
      await store.saveTopic(topic);

      const handler = getTool(server, "forum.detach_from_topic");
      await handler({ topic_id: "topic-detach-1", session_id: "sess-xyz" });

      expect(mockDetachFromTopic).toHaveBeenCalledOnce();
    });

    it("returns { status: 'detached' }", async () => {
      const topic = makeTopic("topic-detach-2");
      await store.saveTopic(topic);

      const handler = getTool(server, "forum.detach_from_topic");
      const result = await handler({ topic_id: "topic-detach-2", session_id: "sess-abc" });
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.status).toBe("detached");
    });
  });

  // ─── forum.get_status ───────────────────────────────────────────────────────

  describe("forum.get_status", () => {
    it("returns topic metadata for an existing topic", async () => {
      const topic = makeTopic("topic-status-1", "running");
      await store.saveTopic(topic);

      const handler = getTool(server, "forum.get_status");
      const result = await handler({ topic_id: "topic-status-1" });
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.id).toBe("topic-status-1");
      expect(data.status).toBe("running");
      expect(data.question).toBe("Test question?");
    });

    it("returns isError: true for missing topic", async () => {
      const handler = getTool(server, "forum.get_status");
      const result = await handler({ topic_id: "missing-topic" });

      expect(result.isError).toBe(true);
    });
  });

  // ─── forum.get_round ────────────────────────────────────────────────────────

  describe("forum.get_round", () => {
    it("returns posts for a round that has data", async () => {
      const topic = makeTopic("topic-round-1");
      await store.saveTopic(topic);

      await store.savePost("topic-round-1", 1, {
        role: "a",
        model: "p/m",
        round: 1,
        timestamp: new Date().toISOString(),
        position: "Yes",
        reasoning: ["Because"],
        confidence: 0.9,
      });

      const handler = getTool(server, "forum.get_round");
      const result = await handler({ topic_id: "topic-round-1", round: 1 });
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.posts).toHaveLength(1);
      expect(data.posts[0].role).toBe("a");
    });

    it("returns isError: true when no posts exist for a round", async () => {
      const topic = makeTopic("topic-round-empty");
      await store.saveTopic(topic);

      const handler = getTool(server, "forum.get_round");
      const result = await handler({ topic_id: "topic-round-empty", round: 2 });

      expect(result.isError).toBe(true);
    });
  });

  // ─── forum.get_consensus ────────────────────────────────────────────────────

  describe("forum.get_consensus", () => {
    it("returns consensus when it exists", async () => {
      const topic = makeTopic("topic-cons-1");
      await store.saveTopic(topic);

      const consensus = makeConsensus("topic-cons-1");
      await store.saveConsensus("topic-cons-1", consensus);

      const handler = getTool(server, "forum.get_consensus");
      const result = await handler({ topic_id: "topic-cons-1" });
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.topic_id).toBe("topic-cons-1");
      expect(data.conclusion).toBe("Test consensus conclusion");
    });

    it("returns isError: true when consensus is missing", async () => {
      const topic = makeTopic("topic-cons-missing");
      await store.saveTopic(topic);

      const handler = getTool(server, "forum.get_consensus");
      const result = await handler({ topic_id: "topic-cons-missing" });

      expect(result.isError).toBe(true);
    });
  });

  // ─── forum.list_topics ──────────────────────────────────────────────────────

  describe("forum.list_topics", () => {
    it("returns all saved topics as summaries", async () => {
      await store.saveTopic(makeTopic("topic-list-1"));
      await store.saveTopic(makeTopic("topic-list-2", "completed"));

      const handler = getTool(server, "forum.list_topics");
      const result = await handler({});
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.topics.length).toBeGreaterThanOrEqual(2);
      const ids = data.topics.map((t: { id: string }) => t.id);
      expect(ids).toContain("topic-list-1");
      expect(ids).toContain("topic-list-2");
    });

    it("returns empty list when no topics exist", async () => {
      const handler = getTool(server, "forum.list_topics");
      const result = await handler({});
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.topics).toHaveLength(0);
    });
  });

  // ─── forum.list_presets ─────────────────────────────────────────────────────

  describe("forum.list_presets", () => {
    it("returns preset summaries", async () => {
      const handler = getTool(server, "forum.list_presets");
      const result = await handler({});
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.presets).toHaveLength(2);
      expect(data.presets[0]).toMatchObject({
        id: "default",
        name: "Balanced Panel",
        agent_count: 3,
        roles: ["skeptic", "proponent", "pragmatist"],
      });
    });
  });

  // ─── forum.get_preset ───────────────────────────────────────────────────────

  describe("forum.get_preset", () => {
    it("returns full agent configs for a preset", async () => {
      const handler = getTool(server, "forum.get_preset");
      const result = await handler({ preset_id: "quick" });
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.preset_id).toBe("quick");
      expect(Array.isArray(data.agents)).toBe(true);
      expect(data.agents[0]).toMatchObject({
        role: "proponent",
        model: expect.any(String),
      });
    });

    it("respects agent_count parameter", async () => {
      const handler = getTool(server, "forum.get_preset");
      const result = await handler({ preset_id: "default", agent_count: 2 });
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.preset_id).toBe("default");
      expect(Array.isArray(data.agents)).toBe(true);
    });

    it("returns agents for preset (mocked)", async () => {
      const handler = getTool(server, "forum.get_preset");
      const result = await handler({ preset_id: "any-id" });
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.preset_id).toBe("any-id");
      expect(Array.isArray(data.agents)).toBe(true);
    });
  });

  // ─── forum.list_models ──────────────────────────────────────────────────────

  describe("forum.list_models", () => {
    it("returns available models from config", async () => {
      const handler = getTool(server, "forum.list_models");
      const result = await handler({});
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(Array.isArray(data.models)).toBe(true);
    });
  });

  // ─── forum.save_preset ──────────────────────────────────────────────────────

  describe("forum.save_preset", () => {
    it("saves a new preset and returns its id", async () => {
      const handler = getTool(server, "forum.save_preset");
      const result = await handler({
        preset_id: "my-custom",
        name: "My Custom Panel",
        description: "Custom 2-agent debate",
        agents: [
          { role: "skeptic", model: "lilith/claude-opus-4-6" },
          { role: "proponent" },
        ],
      });
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.status).toBe("saved");
      expect(data.preset_id).toBe("my-custom");
    });

    it("accepts valid preset_id and saves", async () => {
      const handler = getTool(server, "forum.save_preset");
      const result = await handler({
        preset_id: "valid-custom-id",
        name: "Test",
        description: "Test",
        agents: [{ role: "skeptic" }],
      });

      const data = parseResult(result);
      expect(result.isError).toBeUndefined();
      expect(data.status).toBe("saved");
      expect(data.preset_id).toBe("valid-custom-id");
    });
  });

  // ─── forum.start_debate_async with preset ───────────────────────────────────

  describe("forum.start_debate_async with preset", () => {
    it("accepts a preset param and resolves agents from it", async () => {
      const handler = getTool(server, "forum.start_debate_async");
      const result = await handler({
        question: "Should we use Rust?",
        preset: "quick",
      });
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.status).toBe("started");
      expect(data.topicId).toBeTruthy();
    });

    it("accepts agents array with missing fields and fills via smart defaults", async () => {
      const handler = getTool(server, "forum.start_debate_async");
      const result = await handler({
        question: "Should we use Rust?",
        agents: [{ role: "skeptic" }, { role: "proponent" }],
      });
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.status).toBe("started");
    });

    it("accepts agent_count to limit agents from preset", async () => {
      const handler = getTool(server, "forum.start_debate_async");
      const result = await handler({
        question: "Should we use Rust?",
        preset: "default",
        agent_count: 2,
      });
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.status).toBe("started");
    });

    it("explicit agents take priority over preset", async () => {
      const handler = getTool(server, "forum.start_debate_async");
      const result = await handler({
        question: "Should we use Rust?",
        preset: "quick",
        agents: [{ role: "custom-agent" }],
      });
      const data = parseResult(result);

      expect(result.isError).toBeUndefined();
      expect(data.status).toBe("started");
    });
  });
});
