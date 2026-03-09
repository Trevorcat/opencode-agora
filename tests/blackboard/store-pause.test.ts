import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { BlackboardStore } from "../../src/blackboard/store.js";

describe("BlackboardStore pause state", () => {
  let rootDir: string;
  let store: BlackboardStore;

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), "blackboard-pause-test-"));
    store = new BlackboardStore(rootDir);
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it("isPaused returns false when no pause-state.json exists", async () => {
    const result = await store.isPaused("nonexistent-topic");
    expect(result).toBe(false);
  });

  it("setPauseState(true) → isPaused() returns true", async () => {
    const topicId = "topic-1";
    await store.setPauseState(topicId, true);
    const result = await store.isPaused(topicId);
    expect(result).toBe(true);
  });

  it("setPauseState(false) → isPaused() returns false", async () => {
    const topicId = "topic-1";
    await store.setPauseState(topicId, true);
    await store.setPauseState(topicId, false);
    const result = await store.isPaused(topicId);
    expect(result).toBe(false);
  });

  it("Persists reason field when provided", async () => {
    const topicId = "topic-1";
    const reason = "Waiting for human input";
    await store.setPauseState(topicId, true, reason);
    const result = await store.getPauseReason(topicId);
    expect(result).toBe(reason);
  });

  it("getPauseReason returns undefined when no reason stored", async () => {
    const topicId = "topic-1";
    await store.setPauseState(topicId, true);
    const result = await store.getPauseReason(topicId);
    expect(result).toBe(undefined);
  });

  it("getPauseReason returns reason string when set", async () => {
    const topicId = "topic-1";
    const reason = "Debate stalled";
    await store.setPauseState(topicId, true, reason);
    const result = await store.getPauseReason(topicId);
    expect(result).toBe(reason);
  });

  it("getPauseReason returns undefined after setPauseState(false, undefined)", async () => {
    const topicId = "topic-1";
    await store.setPauseState(topicId, true, "Initial pause reason");
    await store.setPauseState(topicId, false, undefined);
    const result = await store.getPauseReason(topicId);
    expect(result).toBe(undefined);
  });
});
