import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { BlackboardStore } from "../../src/blackboard/store.js";

describe("BlackboardStore Session Attachment", () => {
  let rootDir: string;
  let store: BlackboardStore;

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), "blackboard-session-test-"));
    store = new BlackboardStore(rootDir);
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it("attachSession: creates attached-sessions.json with sessionId", async () => {
    await store.init();
    const topicId = "topic-1";
    const sessionId = "session-abc123";

    await store.attachSession(topicId, sessionId);

    const sessions = await store.getAttachedSessions(topicId);
    expect(sessions).toEqual([sessionId]);
  });

  it("Second attach of same id is idempotent", async () => {
    await store.init();
    const topicId = "topic-1";
    const sessionId = "session-abc123";

    await store.attachSession(topicId, sessionId);
    await store.attachSession(topicId, sessionId);

    const sessions = await store.getAttachedSessions(topicId);
    expect(sessions).toEqual([sessionId]);
    expect(sessions.length).toBe(1);
  });

  it("Multiple different sessions stored correctly", async () => {
    await store.init();
    const topicId = "topic-1";
    const session1 = "session-1";
    const session2 = "session-2";
    const session3 = "session-3";

    await store.attachSession(topicId, session1);
    await store.attachSession(topicId, session2);
    await store.attachSession(topicId, session3);

    const sessions = await store.getAttachedSessions(topicId);
    expect(sessions).toEqual([session1, session2, session3]);
    expect(sessions.length).toBe(3);
  });

  it("detachSession: removes session from list", async () => {
    await store.init();
    const topicId = "topic-1";
    const session1 = "session-1";
    const session2 = "session-2";
    const session3 = "session-3";

    await store.attachSession(topicId, session1);
    await store.attachSession(topicId, session2);
    await store.attachSession(topicId, session3);

    await store.detachSession(topicId, session2);

    const sessions = await store.getAttachedSessions(topicId);
    expect(sessions).toEqual([session1, session3]);
    expect(sessions.length).toBe(2);
  });

  it("Detach non-existent session is safe (no throw)", async () => {
    await store.init();
    const topicId = "topic-1";
    const session1 = "session-1";

    await store.attachSession(topicId, session1);

    await expect(store.detachSession(topicId, "non-existent-session")).resolves.not.toThrow();

    const sessions = await store.getAttachedSessions(topicId);
    expect(sessions).toEqual([session1]);
  });

  it("Detach from empty list is safe", async () => {
    await store.init();
    const topicId = "topic-1";

    await expect(store.detachSession(topicId, "any-session")).resolves.not.toThrow();

    const sessions = await store.getAttachedSessions(topicId);
    expect(sessions).toEqual([]);
  });

  it("getAttachedSessions returns empty array when file doesn't exist", async () => {
    await store.init();
    const topicId = "topic-1";

    const sessions = await store.getAttachedSessions(topicId);
    expect(sessions).toEqual([]);
  });

  it("getAttachedSessions returns all attached sessions", async () => {
    await store.init();
    const topicId = "topic-1";
    const session1 = "session-1";
    const session2 = "session-2";

    await store.attachSession(topicId, session1);
    await store.attachSession(topicId, session2);

    const sessions = await store.getAttachedSessions(topicId);
    expect(sessions).toEqual([session1, session2]);
    expect(sessions.length).toBe(2);
  });
});
