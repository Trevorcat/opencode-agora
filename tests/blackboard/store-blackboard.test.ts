import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { BlackboardStore } from "../../src/blackboard/store.js";
import type { BlackboardItem } from "../../src/blackboard/types.js";

describe("BlackboardStore - Blackboard Operations", () => {
  let rootDir: string;
  let store: BlackboardStore;
  const topicId = "topic-test-1";

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), "blackboard-store-test-"));
    store = new BlackboardStore(rootDir);
    await store.init();
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it("saveBlackboardItem / getBlackboard: saves item and retrieves it by topicId", async () => {
    const item: BlackboardItem = {
      id: "item-1",
      type: "note",
      content: "Test content",
      author: "system",
      timestamp: "2026-03-09T10:00:00.000Z",
      round: 1,
      pinned: false,
      editable: true,
    };

    await store.saveBlackboardItem(topicId, item);
    const items = await store.getBlackboard(topicId);

    expect(items).toHaveLength(1);
    expect(items[0]).toEqual(item);
  });

  it("Returns empty array when blackboard dir doesn't exist", async () => {
    const items = await store.getBlackboard("non-existent-topic");
    expect(items).toEqual([]);
  });

  it("Returns items sorted by timestamp ascending", async () => {
    const item1: BlackboardItem = {
      id: "item-1",
      type: "note",
      content: "First",
      author: "system",
      timestamp: "2026-03-09T12:00:00.000Z",
      round: 1,
      pinned: false,
      editable: true,
    };

    const item2: BlackboardItem = {
      id: "item-2",
      type: "note",
      content: "Second",
      author: "system",
      timestamp: "2026-03-09T10:00:00.000Z",
      round: 1,
      pinned: false,
      editable: true,
    };

    const item3: BlackboardItem = {
      id: "item-3",
      type: "note",
      content: "Third",
      author: "system",
      timestamp: "2026-03-09T11:00:00.000Z",
      round: 1,
      pinned: false,
      editable: true,
    };

    // Save in non-chronological order
    await store.saveBlackboardItem(topicId, item1);
    await store.saveBlackboardItem(topicId, item3);
    await store.saveBlackboardItem(topicId, item2);

    const items = await store.getBlackboard(topicId);

    expect(items).toHaveLength(3);
    expect(items[0].id).toBe("item-2"); // 10:00
    expect(items[1].id).toBe("item-3"); // 11:00
    expect(items[2].id).toBe("item-1"); // 12:00
  });

  it("Stores multiple items as separate {id}.json files", async () => {
    const item1: BlackboardItem = {
      id: "consensus-1",
      type: "consensus",
      content: "Agreed: proceed with pilot",
      author: "moderator",
      timestamp: "2026-03-09T10:00:00.000Z",
      round: 1,
      pinned: true,
      editable: false,
    };

    const item2: BlackboardItem = {
      id: "guidance-1",
      type: "guidance",
      content: "Consider scalability",
      author: "human",
      timestamp: "2026-03-09T10:05:00.000Z",
      round: 1,
      pinned: false,
      editable: true,
    };

    await store.saveBlackboardItem(topicId, item1);
    await store.saveBlackboardItem(topicId, item2);

    const items = await store.getBlackboard(topicId);

    expect(items).toHaveLength(2);
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "consensus-1", type: "consensus" }),
        expect.objectContaining({ id: "guidance-1", type: "guidance" }),
      ])
    );
  });

  it("updateBlackboardItem: merges updates into existing item (partial update)", async () => {
    const originalItem: BlackboardItem = {
      id: "item-to-update",
      type: "note",
      content: "Original content",
      author: "system",
      timestamp: "2026-03-09T10:00:00.000Z",
      round: 1,
      pinned: false,
      editable: true,
    };

    await store.saveBlackboardItem(topicId, originalItem);
    await store.updateBlackboardItem(topicId, "item-to-update", {
      content: "Updated content",
      pinned: true,
    });

    const items = await store.getBlackboard(topicId);
    const updatedItem = items[0];

    expect(updatedItem.id).toBe("item-to-update");
    expect(updatedItem.content).toBe("Updated content");
    expect(updatedItem.pinned).toBe(true);
    expect(updatedItem.type).toBe("note"); // preserved
    expect(updatedItem.author).toBe("system"); // preserved
    expect(updatedItem.timestamp).toBe("2026-03-09T10:00:00.000Z"); // preserved
  });

  it("Throws when itemId not found", async () => {
    await expect(
      store.updateBlackboardItem(topicId, "non-existent-item", { content: "test" })
    ).rejects.toThrow("Blackboard item non-existent-item not found");
  });

  it("Returns all types: 'consensus' | 'guidance' | 'checkpoint' | 'note'", async () => {
    const consensusItem: BlackboardItem = {
      id: "cons-1",
      type: "consensus",
      content: "Consensus reached",
      author: "moderator",
      timestamp: "2026-03-09T10:00:00.000Z",
      round: 1,
      pinned: true,
      editable: false,
    };

    const guidanceItem: BlackboardItem = {
      id: "guide-1",
      type: "guidance",
      content: "Guidance note",
      author: "human",
      timestamp: "2026-03-09T10:01:00.000Z",
      round: 1,
      pinned: false,
      editable: true,
    };

    const checkpointItem: BlackboardItem = {
      id: "check-1",
      type: "checkpoint",
      content: "Checkpoint saved",
      author: "system",
      timestamp: "2026-03-09T10:02:00.000Z",
      round: 1,
      pinned: false,
      editable: false,
    };

    const noteItem: BlackboardItem = {
      id: "note-1",
      type: "note",
      content: "Regular note",
      author: "pro",
      timestamp: "2026-03-09T10:03:00.000Z",
      round: 1,
      pinned: false,
      editable: true,
    };

    await store.saveBlackboardItem(topicId, consensusItem);
    await store.saveBlackboardItem(topicId, guidanceItem);
    await store.saveBlackboardItem(topicId, checkpointItem);
    await store.saveBlackboardItem(topicId, noteItem);

    const items = await store.getBlackboard(topicId);

    expect(items).toHaveLength(4);
    const types = items.map((i) => i.type);
    expect(types).toContain("consensus");
    expect(types).toContain("guidance");
    expect(types).toContain("checkpoint");
    expect(types).toContain("note");
  });

  it("Filters pinned items correctly", async () => {
    const pinnedItem: BlackboardItem = {
      id: "pinned-item",
      type: "consensus",
      content: "Pinned content",
      author: "moderator",
      timestamp: "2026-03-09T10:00:00.000Z",
      round: 1,
      pinned: true,
      editable: false,
    };

    const unpinnedItem: BlackboardItem = {
      id: "unpinned-item",
      type: "note",
      content: "Unpinned content",
      author: "system",
      timestamp: "2026-03-09T10:01:00.000Z",
      round: 1,
      pinned: false,
      editable: true,
    };

    await store.saveBlackboardItem(topicId, pinnedItem);
    await store.saveBlackboardItem(topicId, unpinnedItem);

    const items = await store.getBlackboard(topicId);
    const pinnedItems = items.filter((item) => item.pinned);
    const unpinnedItems = items.filter((item) => !item.pinned);

    expect(pinnedItems).toHaveLength(1);
    expect(pinnedItems[0].id).toBe("pinned-item");
    expect(unpinnedItems).toHaveLength(1);
    expect(unpinnedItems[0].id).toBe("unpinned-item");
  });
});
