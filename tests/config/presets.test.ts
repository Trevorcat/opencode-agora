import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  loadRoles,
  loadPresets,
  resolvePreset,
  resolveAgentsWithDefaults,
  listPresets,
  savePreset,
  type RoleEntry,
  type PresetEntry,
  type PresetCatalog,
  type RoleCatalog,
} from "../../src/config/presets.js";
import type { AgentConfig } from "../../src/blackboard/types.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), "agora-presets-test-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true });
});

const ROLES: RoleCatalog = {
  skeptic: {
    persona: "You are a skeptic.",
    default_model: "lilith/deepseek-v3-2-251201",
  },
  proponent: {
    persona: "You are an advocate.",
    default_model: "lilith/gemini-3-flash-preview",
  },
  pragmatist: {
    persona: "You are a pragmatist.",
    default_model: "lilith/qwen3.5-plus",
  },
};

const PRESETS: PresetCatalog = {
  default: {
    name: "Balanced Panel",
    description: "3-agent balanced debate",
    agents: [{ role: "skeptic" }, { role: "proponent" }, { role: "pragmatist" }],
  },
  quick: {
    name: "Quick Debate",
    description: "2-agent fast debate",
    agents: [{ role: "proponent" }, { role: "skeptic" }],
  },
};

async function writeJson(dir: string, filename: string, data: unknown) {
  await writeFile(path.join(dir, filename), JSON.stringify(data, null, 2), "utf-8");
}

// ─── loadRoles ────────────────────────────────────────────────────────────────

describe("loadRoles", () => {
  it("loads roles.json from agoraDir", async () => {
    await writeJson(tmpDir, "roles.json", ROLES);
    const roles = await loadRoles(tmpDir);
    expect(roles).toEqual(ROLES);
  });

  it("returns empty object when roles.json is missing", async () => {
    const roles = await loadRoles(tmpDir);
    expect(roles).toEqual({});
  });
});

// ─── loadPresets ─────────────────────────────────────────────────────────────

describe("loadPresets", () => {
  it("loads presets.json from agoraDir", async () => {
    await writeJson(tmpDir, "presets.json", PRESETS);
    const presets = await loadPresets(tmpDir);
    expect(presets).toEqual(PRESETS);
  });

  it("returns empty object when presets.json is missing", async () => {
    const presets = await loadPresets(tmpDir);
    expect(presets).toEqual({});
  });
});

// ─── listPresets ─────────────────────────────────────────────────────────────

describe("listPresets", () => {
  it("returns preset summaries without agent details", async () => {
    await writeJson(tmpDir, "presets.json", PRESETS);
    const summaries = await listPresets(tmpDir);
    expect(summaries).toHaveLength(2);
    expect(summaries[0]).toMatchObject({
      id: "default",
      name: "Balanced Panel",
      description: "3-agent balanced debate",
      agent_count: 3,
      roles: ["skeptic", "proponent", "pragmatist"],
    });
    expect(summaries[1]).toMatchObject({
      id: "quick",
      agent_count: 2,
      roles: ["proponent", "skeptic"],
    });
  });

  it("returns empty array when no presets.json", async () => {
    const summaries = await listPresets(tmpDir);
    expect(summaries).toEqual([]);
  });
});

// ─── resolvePreset ────────────────────────────────────────────────────────────

describe("resolvePreset", () => {
  it("resolves a named preset into full AgentConfig[]", async () => {
    await writeJson(tmpDir, "presets.json", PRESETS);
    await writeJson(tmpDir, "roles.json", ROLES);
    const agents = await resolvePreset(tmpDir, "default");
    expect(agents).toHaveLength(3);
    expect(agents[0]).toEqual({
      role: "skeptic",
      persona: "You are a skeptic.",
      model: "lilith/deepseek-v3-2-251201",
    });
    expect(agents[1]).toEqual({
      role: "proponent",
      persona: "You are an advocate.",
      model: "lilith/gemini-3-flash-preview",
    });
  });

  it("applies agent_count to limit agents from preset", async () => {
    await writeJson(tmpDir, "presets.json", PRESETS);
    await writeJson(tmpDir, "roles.json", ROLES);
    const agents = await resolvePreset(tmpDir, "default", { agentCount: 2 });
    expect(agents).toHaveLength(2);
    expect(agents.map((a) => a.role)).toEqual(["skeptic", "proponent"]);
  });

  it("respects explicit model override in preset agent", async () => {
    const presetsWithOverride: PresetCatalog = {
      custom: {
        name: "Custom",
        description: "Test preset",
        agents: [
          { role: "skeptic", model: "lilith/claude-opus-4-6" },
          { role: "proponent" },
        ],
      },
    };
    await writeJson(tmpDir, "presets.json", presetsWithOverride);
    await writeJson(tmpDir, "roles.json", ROLES);
    const agents = await resolvePreset(tmpDir, "custom");
    expect(agents[0].model).toBe("lilith/claude-opus-4-6");
    expect(agents[1].model).toBe("lilith/gemini-3-flash-preview");
  });

  it("throws when preset not found", async () => {
    await writeJson(tmpDir, "presets.json", PRESETS);
    await expect(resolvePreset(tmpDir, "nonexistent")).rejects.toThrow(
      /preset "nonexistent" not found/i,
    );
  });

  it("falls back to role name as persona when role not in roles.json", async () => {
    const presetsWithUnknown: PresetCatalog = {
      custom: {
        name: "Custom",
        description: "Test",
        agents: [{ role: "custom-role" }],
      },
    };
    await writeJson(tmpDir, "presets.json", presetsWithUnknown);
    // No roles.json or unknown role
    const agents = await resolvePreset(tmpDir, "custom");
    expect(agents[0].role).toBe("custom-role");
    expect(agents[0].persona).toContain("custom-role");
  });
});

// ─── resolveAgentsWithDefaults ────────────────────────────────────────────────

describe("resolveAgentsWithDefaults", () => {
  it("fills missing persona from role library", async () => {
    await writeJson(tmpDir, "roles.json", ROLES);
    const input: Array<{ role: string; persona?: string; model?: string }> = [
      { role: "skeptic" },
    ];
    const agents = await resolveAgentsWithDefaults(tmpDir, input);
    expect(agents[0].persona).toBe("You are a skeptic.");
    expect(agents[0].model).toBe("lilith/deepseek-v3-2-251201");
  });

  it("fills missing model from role library but keeps explicit persona", async () => {
    await writeJson(tmpDir, "roles.json", ROLES);
    const input = [{ role: "skeptic", persona: "My custom skeptic persona." }];
    const agents = await resolveAgentsWithDefaults(tmpDir, input);
    expect(agents[0].persona).toBe("My custom skeptic persona.");
    expect(agents[0].model).toBe("lilith/deepseek-v3-2-251201");
  });

  it("keeps explicit persona and model if both provided", async () => {
    await writeJson(tmpDir, "roles.json", ROLES);
    const input: AgentConfig[] = [
      { role: "skeptic", persona: "Custom persona.", model: "lilith/claude-opus-4-6" },
    ];
    const agents = await resolveAgentsWithDefaults(tmpDir, input);
    expect(agents[0].persona).toBe("Custom persona.");
    expect(agents[0].model).toBe("lilith/claude-opus-4-6");
  });

  it("generates fallback persona for completely unknown roles", async () => {
    const input = [{ role: "my-special-role" }];
    const agents = await resolveAgentsWithDefaults(tmpDir, input);
    expect(agents[0].role).toBe("my-special-role");
    expect(typeof agents[0].persona).toBe("string");
    expect(agents[0].persona.length).toBeGreaterThan(10);
  });
});

// ─── savePreset ───────────────────────────────────────────────────────────────

describe("savePreset", () => {
  it("writes a new preset to presets.json", async () => {
    await writeJson(tmpDir, "presets.json", PRESETS);
    await savePreset(tmpDir, "new-preset", {
      name: "New Preset",
      description: "Test",
      agents: [{ role: "skeptic" }],
    });
    const updated = await loadPresets(tmpDir);
    expect(updated["new-preset"]).toBeDefined();
    expect(updated["new-preset"].name).toBe("New Preset");
    // Existing presets preserved
    expect(updated["default"]).toBeDefined();
  });

  it("overwrites existing preset with same id", async () => {
    await writeJson(tmpDir, "presets.json", PRESETS);
    await savePreset(tmpDir, "default", {
      name: "Updated Default",
      description: "Changed",
      agents: [{ role: "proponent" }],
    });
    const updated = await loadPresets(tmpDir);
    expect(updated["default"].name).toBe("Updated Default");
  });
});
