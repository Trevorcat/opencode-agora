import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { BlackboardStore } from "../../src/blackboard/store.js";
import type {
  Consensus,
  DebateStatus,
  Post,
  Topic,
  Vote,
} from "../../src/blackboard/types.js";

describe("BlackboardStore", () => {
  let rootDir: string;
  let store: BlackboardStore;

  const topic: Topic = {
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
          model: "gpt-5",
          provider: "openai",
        },
        {
          role: "con",
          persona: "Operations manager",
          model: "gpt-5",
          provider: "openai",
        },
      ],
    },
    created_at: "2026-03-09T10:00:00.000Z",
  };

  const postPro: Post = {
    role: "pro",
    model: "gpt-5",
    round: 1,
    timestamp: "2026-03-09T10:01:00.000Z",
    position: "Adopt",
    reasoning: ["Improves focus", "Reduces burnout"],
    confidence: 0.8,
  };

  const postCon: Post = {
    role: "con",
    model: "gpt-5",
    round: 1,
    timestamp: "2026-03-09T10:02:00.000Z",
    position: "Do not adopt",
    reasoning: ["Coverage risk", "Coordination overhead"],
    confidence: 0.7,
  };

  const votePro: Vote = {
    role: "pro",
    model: "gpt-5",
    timestamp: "2026-03-09T11:00:00.000Z",
    chosen_position: "Adopt",
    rationale: "Net productivity gain",
    confidence: 0.83,
  };

  const voteCon: Vote = {
    role: "con",
    model: "gpt-5",
    timestamp: "2026-03-09T11:01:00.000Z",
    chosen_position: "Do not adopt",
    rationale: "Too risky operationally",
    confidence: 0.76,
    dissent_notes: "Pilot in one department first",
  };

  const consensus: Consensus = {
    topic_id: "topic-1",
    conclusion: "Run a phased pilot before full adoption",
    confidence: 0.72,
    vote_distribution: {
      adopt: 1,
      reject: 1,
    },
    key_arguments: ["Potential productivity gains", "Coverage complexity"],
    dissenting_views: ["Immediate full rollout"],
    rounds_taken: 2,
    convergence_method: "majority-with-dissent",
    generated_by: "moderator",
  };

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), "blackboard-store-test-"));
    store = new BlackboardStore(rootDir);
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it("init creates the topics directory", async () => {
    await store.init();

    const topicsPath = path.join(rootDir, "topics");
    const topicsStats = await stat(topicsPath);
    expect(topicsStats.isDirectory()).toBe(true);
  });

  it("saves and loads topics and returns null for missing topic", async () => {
    await store.init();

    await store.saveTopic(topic);

    const loaded = await store.getTopic(topic.id);
    const missing = await store.getTopic("missing-topic");

    expect(loaded).toEqual(topic);
    expect(missing).toBeNull();

    const topicFile = path.join(rootDir, "topics", topic.id, "meta.json");
    const rawTopic = await readFile(topicFile, "utf8");
    expect(rawTopic).toContain("\n  \"id\"");
  });

  it("updates topic status", async () => {
    await store.init();
    await store.saveTopic(topic);

    const nextStatus: DebateStatus = "running";
    await store.updateTopicStatus(topic.id, nextStatus);

    const loaded = await store.getTopic(topic.id);
    expect(loaded?.status).toBe("running");
    expect(loaded?.question).toBe(topic.question);
  });

  it("saves and loads posts, round posts, and returns null for missing post", async () => {
    await store.init();

    await store.savePost(topic.id, 1, postPro);
    await store.savePost(topic.id, 1, postCon);

    const loadedPro = await store.getPost(topic.id, 1, "pro");
    const missing = await store.getPost(topic.id, 1, "moderator");
    const roundPosts = await store.getRoundPosts(topic.id, 1);

    expect(loadedPro).toEqual(postPro);
    expect(missing).toBeNull();
    expect(roundPosts).toHaveLength(2);
    expect(roundPosts).toEqual(expect.arrayContaining([postPro, postCon]));
  });

  it("saves and loads votes", async () => {
    await store.init();

    await store.saveVote(topic.id, votePro);
    await store.saveVote(topic.id, voteCon);

    const votes = await store.getVotes(topic.id);

    expect(votes).toHaveLength(2);
    expect(votes).toEqual(expect.arrayContaining([votePro, voteCon]));
  });

  it("saves and loads consensus and returns null when missing", async () => {
    await store.init();

    const missing = await store.getConsensus(topic.id);
    expect(missing).toBeNull();

    await store.saveConsensus(topic.id, consensus);
    const loaded = await store.getConsensus(topic.id);

    expect(loaded).toEqual(consensus);
  });

  it("lists topic directory names", async () => {
    await store.init();

    await store.saveTopic(topic);
    await store.saveTopic({
      ...topic,
      id: "topic-2",
      question: "Should we standardize on one LLM provider?",
    });

    const topicIds = await store.listTopics();

    expect(topicIds).toEqual(expect.arrayContaining(["topic-1", "topic-2"]));
    expect(topicIds).toHaveLength(2);
  });
});
