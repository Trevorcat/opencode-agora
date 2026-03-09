import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { BlackboardStore } from "../../src/blackboard/store.js";
import type { Guidance } from "../../src/blackboard/types.js";

describe("BlackboardStore guidance operations", () => {
  let rootDir: string;
  let store: BlackboardStore;
  let topicId = "test-topic";

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), "guidance-test-"));
    store = new BlackboardStore(rootDir);
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  function createGuidance(
    overrides: Partial<Guidance> = {}
  ): Guidance {
    return {
      id: `guidance-${Date.now()}-${Math.random()}`,
      content: "Test guidance content",
      timestamp: new Date().toISOString(),
      consumed: false,
      ...overrides,
    };
  }

  it("addGuidance / getPendingGuidance: saves guidance and retrieves unconsumed items", async () => {
    const guidance: Guidance = {
      id: "guid-1",
      content: "Focus on scalability",
      timestamp: "2026-03-09T10:00:00.000Z",
      consumed: false,
    };

    await store.addGuidance(topicId, guidance);
    const pending = await store.getPendingGuidance(topicId);

    expect(pending).toHaveLength(1);
    expect(pending[0]).toEqual(guidance);
  });

  it("Returns empty array when guidance dir doesn't exist", async () => {
    const pending = await store.getPendingGuidance(topicId);
    expect(pending).toEqual([]);
  });

  it("Returns items sorted by timestamp ascending", async () => {
    const guidance1: Guidance = {
      id: "guid-1",
      content: "First",
      timestamp: "2026-03-09T12:00:00.000Z",
      consumed: false,
    };
    const guidance2: Guidance = {
      id: "guid-2",
      content: "Second",
      timestamp: "2026-03-09T10:00:00.000Z",
      consumed: false,
    };
    const guidance3: Guidance = {
      id: "guid-3",
      content: "Third",
      timestamp: "2026-03-09T11:00:00.000Z",
      consumed: false,
    };

    await store.addGuidance(topicId, guidance1);
    await store.addGuidance(topicId, guidance2);
    await store.addGuidance(topicId, guidance3);

    const pending = await store.getPendingGuidance(topicId);

    expect(pending).toHaveLength(3);
    expect(pending[0].id).toBe("guid-2");
    expect(pending[1].id).toBe("guid-3");
    expect(pending[2].id).toBe("guid-1");
  });

  it("Filters by target_round when specified", async () => {
    const guidanceRound1: Guidance = {
      id: "guid-r1",
      content: "Round 1 guidance",
      timestamp: "2026-03-09T10:00:00.000Z",
      consumed: false,
      target_round: 1,
    };
    const guidanceRound2: Guidance = {
      id: "guid-r2",
      content: "Round 2 guidance",
      timestamp: "2026-03-09T10:01:00.000Z",
      consumed: false,
      target_round: 2,
    };
    const guidanceNoRound: Guidance = {
      id: "guid-nr",
      content: "No round guidance",
      timestamp: "2026-03-09T10:02:00.000Z",
      consumed: false,
    };

    await store.addGuidance(topicId, guidanceRound1);
    await store.addGuidance(topicId, guidanceRound2);
    await store.addGuidance(topicId, guidanceNoRound);

    const pendingRound1 = await store.getPendingGuidance(topicId, 1);

    expect(pendingRound1).toHaveLength(2);
    expect(pendingRound1).toEqual(
      expect.arrayContaining([guidanceRound1, guidanceNoRound])
    );
  });

  it("Filters by target_agents when specified (overlap match)", async () => {
    const guidanceForPro: Guidance = {
      id: "guid-pro",
      content: "Pro guidance",
      timestamp: "2026-03-09T10:00:00.000Z",
      consumed: false,
      target_agents: ["pro"],
    };
    const guidanceForCon: Guidance = {
      id: "guid-con",
      content: "Con guidance",
      timestamp: "2026-03-09T10:01:00.000Z",
      consumed: false,
      target_agents: ["con"],
    };
    const guidanceForBoth: Guidance = {
      id: "guid-both",
      content: "Both guidance",
      timestamp: "2026-03-09T10:02:00.000Z",
      consumed: false,
      target_agents: ["pro", "con"],
    };
    const guidanceNoTarget: Guidance = {
      id: "guid-none",
      content: "No target guidance",
      timestamp: "2026-03-09T10:03:00.000Z",
      consumed: false,
    };

    await store.addGuidance(topicId, guidanceForPro);
    await store.addGuidance(topicId, guidanceForCon);
    await store.addGuidance(topicId, guidanceForBoth);
    await store.addGuidance(topicId, guidanceNoTarget);

    const pendingForPro = await store.getPendingGuidance(topicId, undefined, [
      "pro",
    ]);

    expect(pendingForPro).toHaveLength(3);
    expect(pendingForPro.map((g) => g.id)).toEqual(
      expect.arrayContaining(["guid-pro", "guid-both", "guid-none"])
    );
  });

  it("Excludes consumed guidance (consumed: true)", async () => {
    const unconsumed: Guidance = {
      id: "guid-unconsumed",
      content: "Unconsumed",
      timestamp: "2026-03-09T10:00:00.000Z",
      consumed: false,
    };
    const consumed: Guidance = {
      id: "guid-consumed",
      content: "Consumed",
      timestamp: "2026-03-09T10:01:00.000Z",
      consumed: true,
    };

    await store.addGuidance(topicId, unconsumed);
    await store.addGuidance(topicId, consumed);

    const pending = await store.getPendingGuidance(topicId);

    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe("guid-unconsumed");
  });

  it("Returns guidance with no target_round when round filter applied", async () => {
    const guidanceWithRound: Guidance = {
      id: "guid-with-round",
      content: "With round",
      timestamp: "2026-03-09T10:00:00.000Z",
      consumed: false,
      target_round: 1,
    };
    const guidanceWithoutRound: Guidance = {
      id: "guid-without-round",
      content: "Without round",
      timestamp: "2026-03-09T10:01:00.000Z",
      consumed: false,
    };

    await store.addGuidance(topicId, guidanceWithRound);
    await store.addGuidance(topicId, guidanceWithoutRound);

    const pendingRound1 = await store.getPendingGuidance(topicId, 1);
    const pendingRound2 = await store.getPendingGuidance(topicId, 2);

    expect(pendingRound1).toHaveLength(2);
    expect(pendingRound1.map((g) => g.id)).toEqual(
      expect.arrayContaining(["guid-with-round", "guid-without-round"])
    );

    expect(pendingRound2).toHaveLength(1);
    expect(pendingRound2[0].id).toBe("guid-without-round");
  });

  it("markGuidanceConsumed: sets consumed: true on guidance item", async () => {
    const guidance: Guidance = {
      id: "guid-mark",
      content: "To be marked",
      timestamp: "2026-03-09T10:00:00.000Z",
      consumed: false,
    };

    await store.addGuidance(topicId, guidance);
    await store.markGuidanceConsumed(topicId, "guid-mark");

    const pending = await store.getPendingGuidance(topicId);
    expect(pending).toHaveLength(0);

    const allGuidance = await store.getPendingGuidance(topicId);
    expect(allGuidance).toHaveLength(0);
  });

  it("Throws when guidance id not found", async () => {
    await expect(
      store.markGuidanceConsumed(topicId, "non-existent-id")
    ).rejects.toThrow("Guidance non-existent-id not found");
  });

  it("Combined filters: round + target_agents", async () => {
    const guidance1: Guidance = {
      id: "guid-1",
      content: "Round 1, pro",
      timestamp: "2026-03-09T10:00:00.000Z",
      consumed: false,
      target_round: 1,
      target_agents: ["pro"],
    };
    const guidance2: Guidance = {
      id: "guid-2",
      content: "Round 1, con",
      timestamp: "2026-03-09T10:01:00.000Z",
      consumed: false,
      target_round: 1,
      target_agents: ["con"],
    };
    const guidance3: Guidance = {
      id: "guid-3",
      content: "Round 2, pro",
      timestamp: "2026-03-09T10:02:00.000Z",
      consumed: false,
      target_round: 2,
      target_agents: ["pro"],
    };
    const guidance4: Guidance = {
      id: "guid-4",
      content: "No round, pro",
      timestamp: "2026-03-09T10:03:00.000Z",
      consumed: false,
      target_agents: ["pro"],
    };

    await store.addGuidance(topicId, guidance1);
    await store.addGuidance(topicId, guidance2);
    await store.addGuidance(topicId, guidance3);
    await store.addGuidance(topicId, guidance4);

    const filtered = await store.getPendingGuidance(topicId, 1, ["pro"]);

    expect(filtered).toHaveLength(2);
    expect(filtered.map((g) => g.id)).toEqual(
      expect.arrayContaining(["guid-1", "guid-4"])
    );
  });

  it("Global guidance (no target) always included", async () => {
    const globalGuidance: Guidance = {
      id: "guid-global",
      content: "Global",
      timestamp: "2026-03-09T10:00:00.000Z",
      consumed: false,
    };
    const targetedGuidance: Guidance = {
      id: "guid-targeted",
      content: "Targeted",
      timestamp: "2026-03-09T10:01:00.000Z",
      consumed: false,
      target_round: 5,
      target_agents: ["moderator"],
    };

    await store.addGuidance(topicId, globalGuidance);
    await store.addGuidance(topicId, targetedGuidance);

    const allPending = await store.getPendingGuidance(topicId);
    const round1Pending = await store.getPendingGuidance(topicId, 1);
    const proPending = await store.getPendingGuidance(topicId, undefined, [
      "pro",
    ]);
    const round2ProPending = await store.getPendingGuidance(topicId, 2, ["pro"]);

    expect(allPending).toHaveLength(2);
    expect(round1Pending).toHaveLength(1);
    expect(round1Pending[0].id).toBe("guid-global");
    expect(proPending).toHaveLength(1);
    expect(proPending[0].id).toBe("guid-global");
    expect(round2ProPending).toHaveLength(1);
    expect(round2ProPending[0].id).toBe("guid-global");
  });
});
