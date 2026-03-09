import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { BlackboardStore } from "../../src/blackboard/store.js";
import type { Topic } from "../../src/blackboard/types.js";

describe("BlackboardStore.updateAgentModel", () => {
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
        {
          role: "pro",
          persona: "Productivity researcher",
          model: "openai/gpt-5",
        },
        {
          role: "con",
          persona: "Operations manager",
          model: "openai/gpt-5",
        },
      ],
    },
    created_at: "2026-03-09T10:00:00.000Z",
    ...overrides,
  });

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), "blackboard-update-agent-test-"));
    store = new BlackboardStore(rootDir);
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it("updates model in meta.json correctly", async () => {
    await store.init();
    const topic = createTopic();
    await store.saveTopic(topic);

    await store.updateAgentModel("topic-1", "pro", "anthropic/claude-3-opus");

    const loaded = await store.getTopic("topic-1");
    expect(loaded?.config.agents.find(a => a.role === "pro")?.model).toBe("anthropic/claude-3-opus");
    expect(loaded?.config.agents.find(a => a.role === "con")?.model).toBe("openai/gpt-5");
  });

  it("throws if topic not found", async () => {
    await store.init();

    await expect(store.updateAgentModel("nonexistent", "pro", "anthropic/claude-3-opus")).rejects.toThrow(
      "Topic not found: nonexistent"
    );
  });

  it("throws if role not found", async () => {
    await store.init();
    const topic = createTopic();
    await store.saveTopic(topic);

    await expect(store.updateAgentModel("topic-1", "moderator", "anthropic/claude-3-opus")).rejects.toThrow(
      "Agent role not found: moderator"
    );
  });

  it("throws if model format invalid (no /)", async () => {
    await store.init();
    const topic = createTopic();
    await store.saveTopic(topic);

    await expect(store.updateAgentModel("topic-1", "pro", "gpt-5")).rejects.toThrow(
      'Model ID must be in "provider/model" format'
    );
  });
});

describe("BlackboardStore.getLiveStatus persona", () => {
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
        {
          role: "pro",
          persona: "Productivity researcher",
          model: "openai/gpt-5",
        },
        {
          role: "con",
          persona: "Operations manager",
          model: "openai/gpt-5",
        },
      ],
    },
    created_at: "2026-03-09T10:00:00.000Z",
    ...overrides,
  });

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), "blackboard-live-status-test-"));
    store = new BlackboardStore(rootDir);
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it("getLiveStatus returns persona field", async () => {
    await store.init();
    const topic = createTopic();
    await store.saveTopic(topic);

    const liveStatus = await store.getLiveStatus("topic-1");

    expect(liveStatus).not.toBeNull();
    expect(liveStatus?.agents).toHaveLength(2);
    expect(liveStatus?.agents.find(a => a.role === "pro")?.persona).toBe("Productivity researcher");
    expect(liveStatus?.agents.find(a => a.role === "con")?.persona).toBe("Operations manager");
  });
});
