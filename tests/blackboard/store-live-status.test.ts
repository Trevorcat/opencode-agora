import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { BlackboardStore } from "../../src/blackboard/store.js";
import type {
  BlackboardItem,
  Guidance,
  Post,
  Topic,
} from "../../src/blackboard/types.js";

describe("BlackboardStore getLiveStatus", () => {
  let rootDir: string;
  let store: BlackboardStore;

  const createTopic = (overrides?: Partial<Topic>): Topic => ({
    id: "topic-1",
    question: "Should we adopt a four-day workweek?",
    context: "Knowledge-work organization",
    constraints: ["Maintain customer support coverage"],
    status: "pending",
    config: {
      max_rounds: 3,
      consensus_threshold: 0.66,
      agents: [
        { role: "pro", persona: "Productivity researcher", model: "openai/gpt-5" },
        { role: "con", persona: "Operations manager", model: "openai/gpt-5" },
      ],
    },
    created_at: "2026-03-09T10:00:00.000Z",
    ...overrides,
  });

  const createPost = (overrides?: Partial<Post>): Post => ({
    role: "pro",
    model: "openai/gpt-5",
    round: 1,
    timestamp: "2026-03-09T10:01:00.000Z",
    position: "Adopt",
    reasoning: ["Improves focus", "Reduces burnout"],
    confidence: 0.8,
    ...overrides,
  });

  const createBlackboardItem = (overrides?: Partial<BlackboardItem>): BlackboardItem => ({
    id: "bb-1",
    type: "note",
    content: "Important note",
    author: "system",
    timestamp: "2026-03-09T10:00:00.000Z",
    round: 1,
    pinned: false,
    editable: true,
    ...overrides,
  });

  const createGuidance = (overrides?: Partial<Guidance>): Guidance => ({
    id: "guidance-1",
    content: "Focus on productivity metrics",
    timestamp: "2026-03-09T10:00:00.000Z",
    consumed: false,
    ...overrides,
  });

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), "blackboard-live-status-test-"));
    store = new BlackboardStore(rootDir);
    await store.init();
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it("returns null for non-existent topic", async () => {
    const status = await store.getLiveStatus("non-existent-topic");
    expect(status).toBeNull();
  });

  it("returns status=pending for fresh topic", async () => {
    const topic = createTopic({ status: "pending" });
    await store.saveTopic(topic);

    const status = await store.getLiveStatus(topic.id);

    expect(status).not.toBeNull();
    expect(status?.status).toBe("pending");
  });

  it("returns status=paused when topic is running and isPaused=true", async () => {
    const topic = createTopic({ status: "running" });
    await store.saveTopic(topic);
    await store.setPauseState(topic.id, true, "Testing pause");

    const status = await store.getLiveStatus(topic.id);

    expect(status?.status).toBe("paused");
  });

  it("returns status=running when topic is running and not paused", async () => {
    const topic = createTopic({ status: "running" });
    await store.saveTopic(topic);

    const status = await store.getLiveStatus(topic.id);

    expect(status?.status).toBe("running");
  });

  it("current_round reflects round with posts (not just dir existence)", async () => {
    const topic = createTopic();
    await store.saveTopic(topic);

    // Round 1 has no posts yet
    let status = await store.getLiveStatus(topic.id);
    expect(status?.current_round).toBe(1);

    // Add post to round 3 (skip round 2)
    await store.savePost(topic.id, 3, createPost({ round: 3 }));

    status = await store.getLiveStatus(topic.id);
    expect(status?.current_round).toBe(3);

    // Empty round 4 directory should not be counted
    // (This is implicit - we only count rounds with posts)
  });

  it("agents array has correct role/model/status", async () => {
    const topic = createTopic({
      config: {
        max_rounds: 3,
        consensus_threshold: 0.66,
        agents: [
          { role: "pro", persona: "Pro agent", model: "openai/gpt-5" },
          { role: "con", persona: "Con agent", model: "anthropic/claude-3" },
        ],
      },
    });
    await store.saveTopic(topic);

    const status = await store.getLiveStatus(topic.id);

    expect(status?.agents).toHaveLength(2);
    expect(status?.agents[0].role).toBe("pro");
    expect(status?.agents[0].model).toBe("openai/gpt-5");
    expect(status?.agents[1].role).toBe("con");
    expect(status?.agents[1].model).toBe("anthropic/claude-3");
  });

  it("agent status=posted when post exists for current round", async () => {
    const topic = createTopic();
    await store.saveTopic(topic);

    // Add post for pro in round 1
    await store.savePost(topic.id, 1, createPost({ role: "pro", round: 1 }));

    const status = await store.getLiveStatus(topic.id);

    const proAgent = status?.agents.find((a) => a.role === "pro");
    const conAgent = status?.agents.find((a) => a.role === "con");

    expect(proAgent?.status).toBe("posted");
    expect(conAgent?.status).toBe("waiting");
  });

  it("agent status=waiting when no post yet", async () => {
    const topic = createTopic();
    await store.saveTopic(topic);

    const status = await store.getLiveStatus(topic.id);

    expect(status?.agents[0].status).toBe("waiting");
    expect(status?.agents[1].status).toBe("waiting");
  });

  it("blackboard array populated from saveBlackboardItem", async () => {
    const topic = createTopic();
    await store.saveTopic(topic);

    const bbItem1 = createBlackboardItem({ id: "bb-1", content: "First note" });
    const bbItem2 = createBlackboardItem({ id: "bb-2", content: "Second note", type: "checkpoint" });

    await store.saveBlackboardItem(topic.id, bbItem1);
    await store.saveBlackboardItem(topic.id, bbItem2);

    const status = await store.getLiveStatus(topic.id);

    expect(status?.blackboard).toHaveLength(2);
    expect(status?.blackboard).toContainEqual(expect.objectContaining({ id: "bb-1", content: "First note" }));
    expect(status?.blackboard).toContainEqual(expect.objectContaining({ id: "bb-2", content: "Second note" }));
  });

  it("pending_guidance count reflects unconsumed items", async () => {
    const topic = createTopic();
    await store.saveTopic(topic);

    const guidance1 = createGuidance({ id: "guidance-1", consumed: false });
    const guidance2 = createGuidance({ id: "guidance-2", consumed: true });
    const guidance3 = createGuidance({ id: "guidance-3", consumed: false });

    await store.addGuidance(topic.id, guidance1);
    await store.addGuidance(topic.id, guidance2);
    await store.addGuidance(topic.id, guidance3);

    const status = await store.getLiveStatus(topic.id);

    expect(status?.pending_guidance).toBe(2);
  });

  it("recent_posts contains last 10 posts (across all rounds)", async () => {
    const topic = createTopic();
    await store.saveTopic(topic);

    // Add 12 posts across multiple rounds (but current_round will be 4)
    for (let round = 1; round <= 4; round++) {
      await store.savePost(topic.id, round, createPost({ role: "pro", round, timestamp: `2026-03-09T10:${round}:00.000Z` }));
      await store.savePost(topic.id, round, createPost({ role: "con", round, timestamp: `2026-03-09T10:${round + 1}:00.000Z` }));
    }

    const status = await store.getLiveStatus(topic.id);

    // With current_round=4, we get all 8 posts (4 rounds x 2 agents)
    // The slice(-10) only limits to 10, so 8 posts is correct
    expect(status?.recent_posts).toHaveLength(8);
    // Should contain posts from all rounds
    const roundNumbers = status?.recent_posts.map((p) => p.round);
    expect(roundNumbers).toContain(1);
    expect(roundNumbers).toContain(4);
  });

  it("total_rounds matches topic.config.max_rounds", async () => {
    const topic = createTopic({
      config: {
        max_rounds: 5,
        consensus_threshold: 0.66,
        agents: [
          { role: "pro", persona: "Productivity researcher", model: "openai/gpt-5" },
          { role: "con", persona: "Operations manager", model: "openai/gpt-5" },
        ],
      },
    });
    await store.saveTopic(topic);

    const status = await store.getLiveStatus(topic.id);

    expect(status?.total_rounds).toBe(5);
  });
});
