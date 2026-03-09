# Plugin Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make it trivially easy to launch and configure multi-agent debates from within OpenCode via a `/debate` slash command, preset templates, smart agent defaults, and a standalone TUI preset picker.

**Architecture:** Presets + role library are stored as JSON files in `.agora/`. A new `src/config/presets.ts` module resolves them into full `AgentConfig[]`. The MCP server gains 3 new tools (`forum.list_presets`, `forum.get_preset`, `forum.list_models`) and `forum.start_debate_async` gains `preset`, smart-defaults, and `agent_count` params. The TUI gains an interactive preset picker shown when no topicId is provided.

**Tech Stack:** TypeScript, Vitest, Zod, OpenTUI/React (Bun), MCP SDK

---

## Task 1: Role Library + Preset Data Files

**Files:**
- Create: `.agora/roles.json`
- Create: `.agora/presets.json`

No code — pure JSON data files that define the role library and preset catalog.

### Step 1: Create `.agora/roles.json`

```json
{
  "skeptic": {
    "persona": "You are a strict skeptic. Challenge assumptions rigorously. Demand concrete evidence for claims. Find logical flaws and inconsistencies. Refuse to agree without solid proof. Question the validity of arguments. Identify hidden biases and unexamined premises. Do not be swayed by popularity or appeal to authority. Focus on logical rigor and evidentiary standards.",
    "default_model": "lilith/deepseek-v3-2-251201"
  },
  "proponent": {
    "persona": "You are a positive advocate. Build the strongest case for promising approaches. Seek out supporting evidence and examples. Address objections constructively. Highlight benefits and opportunities. Frame challenges as solvable problems. Synthesize arguments into coherent positions. Be enthusiastic but not blind to risks. Your goal is to ensure good ideas get fair consideration.",
    "default_model": "lilith/gemini-3-flash-preview"
  },
  "analyst": {
    "persona": "You are a data-driven analyst. Evaluate proposals using facts, data, and case studies. Avoid subjective opinions and emotional appeals. Focus on quantifiable comparisons and metrics. Reference empirical evidence and benchmarks. Identify gaps in available data. Present balanced, evidence-based conclusions. Prioritize objective analysis over intuition. When data is lacking, state this clearly rather than speculating.",
    "default_model": "lilith/gemini-3.1-pro-preview"
  },
  "pragmatist": {
    "persona": "You are a practical engineer. Evaluate feasibility, cost, maintenance, and risk. Focus on what can we do and is it worth doing. Consider implementation complexity and timelines. Identify practical obstacles and workarounds. Assess resource requirements and constraints. Balance ideal solutions with real-world limitations. Think about what will actually work in production, not just what sounds good in theory.",
    "default_model": "lilith/qwen3.5-plus"
  },
  "security-auditor": {
    "persona": "You are a security-focused engineer. Evaluate all proposals through the lens of security risk, attack surface, and threat modeling. Identify vulnerabilities, authentication weaknesses, data exposure risks, and injection vectors. Propose mitigations and question designs that sacrifice security for convenience.",
    "default_model": "lilith/claude-opus-4-6"
  },
  "performance-engineer": {
    "persona": "You are a performance-obsessed engineer. Evaluate every design decision for its impact on latency, throughput, memory, and scalability. Identify bottlenecks, inefficient algorithms, unnecessary I/O, and poor caching strategies. Demand benchmarks and profiling data before accepting performance claims.",
    "default_model": "lilith/deepseek-v3-2-251201"
  },
  "maintainability-advocate": {
    "persona": "You are a software craftsperson focused on long-term maintainability. Evaluate code and designs for readability, testability, extensibility, and simplicity. Push back on over-engineering, unnecessary complexity, and poor separation of concerns. Advocate for clean interfaces, good naming, and comprehensive documentation.",
    "default_model": "lilith/gemini-3-flash-preview"
  },
  "devils-advocate": {
    "persona": "You are a devil's advocate. Your purpose is to surface the strongest possible objections to the prevailing view, even if you secretly agree with it. Find edge cases, stress scenarios, and unconventional failure modes. Challenge the group's assumptions by steelmanning the opposition.",
    "default_model": "lilith/qwen3.5-plus"
  },
  "ethicist": {
    "persona": "You are an AI ethics and societal impact analyst. Evaluate proposals for fairness, bias, privacy implications, societal harms, and misuse potential. Consider second-order effects and unintended consequences. Advocate for responsible design and inclusive outcomes.",
    "default_model": "lilith/claude-opus-4-6"
  },
  "product-manager": {
    "persona": "You are a product manager representing user needs and business value. Evaluate proposals for user impact, time-to-market, prioritization, and alignment with user goals. Push back on technically elegant but user-irrelevant solutions. Advocate for shipping incrementally and validating assumptions early.",
    "default_model": "lilith/gemini-3-flash-preview"
  }
}
```

### Step 2: Create `.agora/presets.json`

```json
{
  "default": {
    "name": "Balanced Panel",
    "description": "General-purpose 3-agent debate: skeptic challenges, proponent builds, pragmatist evaluates feasibility",
    "agents": [
      { "role": "skeptic" },
      { "role": "proponent" },
      { "role": "pragmatist" }
    ]
  },
  "balanced-4": {
    "name": "Full Analysis Panel",
    "description": "4-agent debate adding a data-driven analyst for evidence-based evaluation",
    "agents": [
      { "role": "skeptic" },
      { "role": "proponent" },
      { "role": "analyst" },
      { "role": "pragmatist" }
    ]
  },
  "code-review": {
    "name": "Code Review Board",
    "description": "4 specialists reviewing code and architecture: security, performance, maintainability, and a devil's advocate",
    "agents": [
      { "role": "security-auditor" },
      { "role": "performance-engineer" },
      { "role": "maintainability-advocate" },
      { "role": "devils-advocate" }
    ]
  },
  "quick": {
    "name": "Quick Debate",
    "description": "Fast 2-agent for/against debate, ideal for rapid decisions",
    "agents": [
      { "role": "proponent" },
      { "role": "skeptic" }
    ]
  },
  "product": {
    "name": "Product Council",
    "description": "Product, engineering, and ethics perspectives for feature decisions",
    "agents": [
      { "role": "product-manager" },
      { "role": "pragmatist" },
      { "role": "ethicist" },
      { "role": "devils-advocate" }
    ]
  },
  "ethics": {
    "name": "Ethics Review",
    "description": "3-agent panel for ethical and societal impact analysis",
    "agents": [
      { "role": "ethicist" },
      { "role": "skeptic" },
      { "role": "proponent" }
    ]
  }
}
```

### Step 3: Commit

```bash
git add .agora/roles.json .agora/presets.json
git commit -m "feat: add role library and preset catalog data files"
```

---

## Task 2: `src/config/presets.ts` — Preset Loader Module

**Files:**
- Create: `src/config/presets.ts`
- Create: `tests/config/presets.test.ts`

This module loads presets + roles and resolves full `AgentConfig[]` from partial definitions.

### Step 1: Write the failing tests

Create `tests/config/presets.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  loadRoles,
  loadPresets,
  resolvePreset,
  resolveAgentsWithDefaults,
  listPresets,
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
    expect(agents.map(a => a.role)).toEqual(["skeptic", "proponent"]);
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
      /preset "nonexistent" not found/i
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
```

### Step 2: Run tests to verify they fail

```bash
npx vitest run tests/config/presets.test.ts
```

Expected: FAIL — `Cannot find module '../../src/config/presets.js'`

### Step 3: Implement `src/config/presets.ts`

```typescript
// src/config/presets.ts
// Loads preset catalog and role library from .agora/ directory.
// Resolves partial AgentConfig definitions into complete AgentConfig[].

import { promises as fs } from "node:fs";
import path from "node:path";
import type { AgentConfig } from "../blackboard/types.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RoleEntry {
  persona: string;
  default_model: string;
}

export type RoleCatalog = Record<string, RoleEntry>;

export interface PresetAgentDef {
  role: string;
  persona?: string;
  model?: string;
}

export interface PresetEntry {
  name: string;
  description: string;
  agents: PresetAgentDef[];
}

export type PresetCatalog = Record<string, PresetEntry>;

export interface PresetSummary {
  id: string;
  name: string;
  description: string;
  agent_count: number;
  roles: string[];
}

const SYSTEM_DEFAULT_MODEL = "lilith/deepseek-v3-2-251201";

// ─── Loaders ─────────────────────────────────────────────────────────────────

export async function loadRoles(agoraDir: string): Promise<RoleCatalog> {
  const filePath = path.join(agoraDir, "roles.json");
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as RoleCatalog;
  } catch {
    return {};
  }
}

export async function loadPresets(agoraDir: string): Promise<PresetCatalog> {
  const filePath = path.join(agoraDir, "presets.json");
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as PresetCatalog;
  } catch {
    return {};
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * List all presets as lightweight summaries (no agent persona text).
 */
export async function listPresets(agoraDir: string): Promise<PresetSummary[]> {
  const catalog = await loadPresets(agoraDir);
  return Object.entries(catalog).map(([id, entry]) => ({
    id,
    name: entry.name,
    description: entry.description,
    agent_count: entry.agents.length,
    roles: entry.agents.map((a) => a.role),
  }));
}

/**
 * Resolve a named preset into full AgentConfig[].
 * Fills missing persona/model from the role library.
 * Optionally limits the number of agents with agentCount.
 */
export async function resolvePreset(
  agoraDir: string,
  presetId: string,
  opts: { agentCount?: number } = {},
): Promise<AgentConfig[]> {
  const [catalog, roles] = await Promise.all([loadPresets(agoraDir), loadRoles(agoraDir)]);

  const preset = catalog[presetId];
  if (!preset) {
    throw new Error(`Preset "${presetId}" not found. Available: ${Object.keys(catalog).join(", ")}`);
  }

  let agents = preset.agents;
  if (opts.agentCount !== undefined) {
    agents = agents.slice(0, opts.agentCount);
  }

  return agents.map((def) => resolveAgentDef(def, roles));
}

/**
 * Fill missing persona/model for a partial agents array using the role library.
 * Used when the caller provides explicit agents with some fields omitted.
 */
export async function resolveAgentsWithDefaults(
  agoraDir: string,
  agents: Array<{ role: string; persona?: string; model?: string }>,
): Promise<AgentConfig[]> {
  const roles = await loadRoles(agoraDir);
  return agents.map((a) => resolveAgentDef(a, roles));
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function resolveAgentDef(
  def: PresetAgentDef,
  roles: RoleCatalog,
): AgentConfig {
  const roleEntry = roles[def.role];
  const persona =
    def.persona ??
    roleEntry?.persona ??
    `You are debating as the "${def.role}" perspective. Provide thoughtful analysis from this viewpoint.`;
  const model = def.model ?? roleEntry?.default_model ?? SYSTEM_DEFAULT_MODEL;
  return { role: def.role, persona, model };
}
```

### Step 4: Run tests to verify they pass

```bash
npx vitest run tests/config/presets.test.ts
```

Expected: All tests PASS.

### Step 5: Commit

```bash
git add src/config/presets.ts tests/config/presets.test.ts
git commit -m "feat: add preset loader module with role library and smart defaults"
```

---

## Task 3: MCP Server — 3 New Tools + Enhanced `start_debate_async`

**Files:**
- Modify: `src/server.ts`
- Modify: `tests/server/server-tools.test.ts`

Add `forum.list_presets`, `forum.get_preset`, `forum.list_models`, and extend `forum.start_debate_async` with `preset`, `agent_count`, and smart-default resolution.

### Step 1: Write the failing tests

Append to `tests/server/server-tools.test.ts`. Find the existing test file's helper `callTool` function pattern, then add a new `describe` block at the end:

```typescript
// At the top of the file, add this import alongside others:
import { vi } from "vitest";

// Add mock for presets module (alongside existing vi.mock calls):
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
    { role: "proponent", persona: "You are an advocate.", model: "lilith/gemini-3-flash-preview" },
    { role: "skeptic", persona: "You are a skeptic.", model: "lilith/deepseek-v3-2-251201" },
  ]),
  resolveAgentsWithDefaults: vi.fn().mockImplementation(async (_dir, agents) =>
    agents.map((a: { role: string; persona?: string; model?: string }) => ({
      role: a.role,
      persona: a.persona ?? `Default persona for ${a.role}`,
      model: a.model ?? "lilith/deepseek-v3-2-251201",
    }))
  ),
}));

// New describe blocks to add at end of file:

describe("forum.list_presets", () => {
  it("returns preset summaries", async () => {
    const result = await callTool("forum.list_presets", {});
    const data = JSON.parse(result.content[0].text);
    expect(data.presets).toHaveLength(2);
    expect(data.presets[0]).toMatchObject({
      id: "default",
      name: "Balanced Panel",
      agent_count: 3,
      roles: ["skeptic", "proponent", "pragmatist"],
    });
  });
});

describe("forum.get_preset", () => {
  it("returns full agent configs for a preset", async () => {
    const result = await callTool("forum.get_preset", { preset_id: "quick" });
    const data = JSON.parse(result.content[0].text);
    expect(data.preset_id).toBe("quick");
    expect(Array.isArray(data.agents)).toBe(true);
    expect(data.agents[0]).toMatchObject({ role: "proponent", model: expect.any(String) });
  });
});

describe("forum.list_models", () => {
  it("returns available models from config", async () => {
    const result = await callTool("forum.list_models", {});
    const data = JSON.parse(result.content[0].text);
    expect(Array.isArray(data.models)).toBe(true);
  });
});

describe("forum.start_debate_async with preset", () => {
  it("accepts a preset param and resolves agents from it", async () => {
    const result = await callTool("forum.start_debate_async", {
      question: "Should we use Rust?",
      preset: "quick",
    });
    const data = JSON.parse(result.content[0].text);
    expect(data.status).toBe("started");
    expect(data.topicId).toBeTruthy();
  });

  it("accepts agents array with missing fields and fills them via smart defaults", async () => {
    const result = await callTool("forum.start_debate_async", {
      question: "Should we use Rust?",
      agents: [{ role: "skeptic" }, { role: "proponent" }],
    });
    const data = JSON.parse(result.content[0].text);
    expect(data.status).toBe("started");
  });

  it("accepts agent_count to limit agents from preset", async () => {
    const result = await callTool("forum.start_debate_async", {
      question: "Should we use Rust?",
      preset: "default",
      agent_count: 2,
    });
    const data = JSON.parse(result.content[0].text);
    expect(data.status).toBe("started");
  });
});
```

### Step 2: Run tests to verify they fail

```bash
npx vitest run tests/server/server-tools.test.ts
```

Expected: FAIL on the new test cases.

### Step 3: Implement changes in `src/server.ts`

**3a. Add new imports at top of file:**

```typescript
import { listPresets, resolvePreset, resolveAgentsWithDefaults } from "./config/presets.js";
import { listAvailableModels } from "./config/opencode-loader.js";
```

(Note: `listAvailableModels` and `loadOpenCodeConfig` are already imported indirectly via `opts.providers` — but we need the model list. Pass it through `ServerOptions`.)

**3b. Add `availableModels` to `ServerOptions`:**

```typescript
interface ServerOptions {
  store: BlackboardStore;
  agoraDir: string;
  providers: Map<string, ResolvedProvider>;
  moderatorModel: string;
  availableModels: AvailableModel[];          // ← ADD THIS
  onProgress?: (event: ProgressEvent) => void | Promise<void>;
}
```

Add `AvailableModel` to the import from `opencode-loader`.

**3c. Update `createAgoraServer` destructure:**

```typescript
const { store, agoraDir, providers, moderatorModel, availableModels, onProgress } = opts;
```

**3d. Add `forum.list_presets` tool:**

```typescript
server.tool(
  "forum.list_presets",
  "List available debate presets with agent role configurations",
  {},
  async () => {
    const presets = await listPresets(agoraDir);
    return toToolResult({ presets });
  },
);
```

**3e. Add `forum.get_preset` tool:**

```typescript
server.tool(
  "forum.get_preset",
  "Get full agent configuration for a named debate preset",
  {
    preset_id: z.string().min(1).describe("Preset ID from forum.list_presets"),
    agent_count: z.number().int().min(2).max(8).optional()
      .describe("Limit number of agents (picks first N from preset)"),
  },
  async ({ preset_id, agent_count }) => {
    try {
      const agents = await resolvePreset(agoraDir, preset_id, { agentCount: agent_count });
      return toToolResult({ preset_id, agents });
    } catch (error) {
      return toToolResult(
        { preset_id, error: error instanceof Error ? error.message : String(error) },
        true,
      );
    }
  },
);
```

**3f. Add `forum.list_models` tool:**

```typescript
server.tool(
  "forum.list_models",
  "List all available model IDs from OpenCode providers",
  {},
  async () => {
    return toToolResult({ models: availableModels });
  },
);
```

**3g. Extend `forum.start_debate_async` schema and resolution logic:**

Replace the existing `forum.start_debate_async` `agents` parameter block and handler with:

```typescript
server.tool(
  "forum.start_debate_async",
  "Start a 3-round debate asynchronously (returns immediately, monitor with get_live_status)",
  {
    question: z.string().min(1),
    context: z.string().optional(),
    preset: z.string().optional()
      .describe("Named preset ID (from forum.list_presets). Expands to predefined agent configs."),
    agents: z
      .array(
        z.object({
          role: z.string().min(1),
          persona: z.string().optional()
            .describe("Agent persona/instructions. Filled from role library if omitted."),
          model: z.string().optional()
            .describe("Model ID (provider/model). Uses role default if omitted."),
        }),
      )
      .optional()
      .describe("Explicit agent configs. Takes priority over preset. Missing fields filled from role library."),
    agent_count: z.number().int().min(2).max(8).optional()
      .describe("Limit agents from preset to first N (ignored when explicit agents provided)"),
    pause_after_rounds: z.array(z.number().int().min(1).max(3)).optional()
      .describe("Automatically pause after these round numbers"),
  },
  async ({ question, context, preset, agents, agent_count, pause_after_rounds }) => {
    const topicId = generateTopicId();

    try {
      // Resolution order: explicit agents > preset > .agora/agents.json > DEFAULT_AGENTS
      let panel: AgentConfig[];
      if (agents && agents.length > 0) {
        // Smart-fill missing persona/model from role library
        panel = await resolveAgentsWithDefaults(agoraDir, agents);
      } else if (preset) {
        panel = await resolvePreset(agoraDir, preset, { agentCount: agent_count });
      } else {
        panel = await loadAgentConfig(agoraDir);
      }

      // ... rest of handler unchanged
    }
  }
);
```

**Also update `forum.start_debate` (blocking version) with the same preset/smart-default logic.**

### Step 4: Update `src/index.ts` to pass `availableModels`

In `src/index.ts`, where `createAgoraServer` is called, add `availableModels` to the options:

```typescript
const server = createAgoraServer({
  store,
  agoraDir,
  providers,
  moderatorModel,
  availableModels,   // ← ADD
});
```

`availableModels` is already computed from `listAvailableModels(openCodeConfig)` — just pass it through.

### Step 5: Run tests to verify they pass

```bash
npx vitest run tests/server/server-tools.test.ts
```

Expected: All tests PASS.

### Step 6: Run full test suite

```bash
npm test
```

Expected: All 197+ tests PASS.

### Step 7: Commit

```bash
git add src/server.ts src/index.ts tests/server/server-tools.test.ts
git commit -m "feat: add list_presets, get_preset, list_models tools and preset/smart-default resolution in start_debate_async"
```

---

## Task 4: `/debate` Slash Command

**Files:**
- Create: `C:\Users\chenkejie\.config\opencode\commands\debate.md`

No code — a Markdown file that becomes the `/debate` slash command in OpenCode.

### Step 1: Create `debate.md`

```markdown
---
description: Launch a multi-agent AI debate on any topic or question
argument-hint: <topic or question>
---

You are a debate orchestrator. The user wants to start a multi-agent forum debate.

## Your Workflow

**Step 1: Get the topic**
- If the user provided an argument (e.g. `/debate Should we use Rust?`), use that as the topic.
- If no argument was provided, ask the user: "What topic or question should the agents debate?"

**Step 2: Offer preset selection**
Call `forum.list_presets` to get available presets.
Show the user a quick summary:
```
Available debate formats:
  default    — Balanced Panel (3 agents: skeptic, proponent, pragmatist) [recommended]
  quick      — Quick Debate (2 agents: for/against, fastest)
  balanced-4 — Full Analysis Panel (4 agents, adds data analyst)
  code-review — Code Review Board (4 specialists: security, performance, maintainability, devil's-advocate)
  product    — Product Council (PM, engineer, ethicist, devil's-advocate)
  ethics     — Ethics Review (3 agents: ethicist, skeptic, proponent)
```
Ask: "Which format? (Press Enter for 'default', or type a format name)"

**Step 3: Optional customization**
Ask: "Any model preferences or custom agent count? (Press Enter to skip)"
- If the user wants to see available models, call `forum.list_models`.
- If the user specifies agent count, pass `agent_count` param.
- If the user wants a specific model for an agent, use the explicit `agents` array instead of `preset`.

**Step 4: Start the debate**
Call `forum.start_debate_async` with:
- `question`: the topic
- `preset`: chosen preset ID (or omit for default)
- `agent_count`: if user specified (optional)
- `agents`: only if user wants custom model assignments (skips preset)

Example calls:
```json
// Simple
{ "question": "Should we use Rust for the CLI?", "preset": "quick" }

// With agent count
{ "question": "Should we use microservices?", "preset": "balanced-4", "agent_count": 3 }

// Custom model assignment (overrides preset)
{ "question": "Is TDD worth it?", "agents": [
    { "role": "skeptic", "model": "lilith/claude-opus-4-6" },
    { "role": "proponent" }
  ]
}
```

**Step 5: Launch TUI and monitor**
After getting the `topicId` from the response:
1. Tell the user to open a terminal and run:
   ```
   npm run tui <topicId>
   ```
   or if they have Bun:
   ```
   bun run src/tui-opentui/index.tsx <topicId>
   ```
2. Poll `forum.get_live_status` every 30 seconds and report key milestones:
   - Round 1 started / completed
   - Round 2 started / completed  
   - Round 3 / voting / consensus
3. When `status` is `"completed"`, call `forum.get_consensus` and present the final consensus summary to the user.

## Tips
- Keep it fast: if the user just wants to start immediately, don't ask too many questions. Default preset + their topic is enough.
- If the user seems to want customization, walk them through it step by step.
- The debate runs async — you can continue helping the user with other things while it runs.
```

### Step 2: Verify the command appears in OpenCode

Restart or reload OpenCode session, then type `/debate` — it should appear in the command list with description "Launch a multi-agent AI debate on any topic or question".

### Step 3: Commit (just track the file in the repo, the actual file is at the OpenCode config path)

```bash
# Copy to repo for version control
mkdir -p docs/commands
cp "C:/Users/chenkejie/.config/opencode/commands/debate.md" docs/commands/debate.md
git add docs/commands/debate.md
git commit -m "feat: add /debate slash command for OpenCode"
```

---

## Task 5: `forum.save_preset` — Save User-Created Presets via MCP

**Files:**
- Modify: `src/server.ts`
- Modify: `tests/server/server-tools.test.ts`

Allows the LLM agent (via `/debate`) to save a custom preset that the user configured interactively.

### Step 1: Write the failing test

Add to `tests/server/server-tools.test.ts`:

```typescript
// Add to vi.mock for presets.js:
// savePreset: vi.fn().mockResolvedValue(undefined),

describe("forum.save_preset", () => {
  it("saves a new preset and returns its id", async () => {
    const result = await callTool("forum.save_preset", {
      preset_id: "my-custom",
      name: "My Custom Panel",
      description: "Custom 2-agent debate",
      agents: [
        { role: "skeptic", model: "lilith/claude-opus-4-6" },
        { role: "proponent" },
      ],
    });
    const data = JSON.parse(result.content[0].text);
    expect(data.status).toBe("saved");
    expect(data.preset_id).toBe("my-custom");
  });
});
```

### Step 2: Run tests to verify they fail

```bash
npx vitest run tests/server/server-tools.test.ts
```

Expected: FAIL.

### Step 3: Add `savePreset` to `src/config/presets.ts`

```typescript
/**
 * Save or update a preset in presets.json.
 */
export async function savePreset(
  agoraDir: string,
  presetId: string,
  entry: PresetEntry,
): Promise<void> {
  const catalog = await loadPresets(agoraDir);
  catalog[presetId] = entry;
  const filePath = path.join(agoraDir, "presets.json");
  await fs.writeFile(filePath, JSON.stringify(catalog, null, 2), "utf-8");
}
```

Also add corresponding tests to `tests/config/presets.test.ts`:

```typescript
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
```

### Step 4: Add `forum.save_preset` tool to `src/server.ts`

```typescript
server.tool(
  "forum.save_preset",
  "Save a custom debate preset for future reuse",
  {
    preset_id: z.string().min(1).regex(/^[a-z0-9-]+$/)
      .describe("URL-safe preset identifier (lowercase, hyphens only)"),
    name: z.string().min(1).describe("Human-readable name"),
    description: z.string().min(1).describe("What this preset is for"),
    agents: z.array(
      z.object({
        role: z.string().min(1),
        persona: z.string().optional(),
        model: z.string().optional(),
      }),
    ).min(2).max(8),
  },
  async ({ preset_id, name, description, agents }) => {
    await savePreset(agoraDir, preset_id, { name, description, agents });
    return toToolResult({
      status: "saved",
      preset_id,
      message: `Preset "${preset_id}" saved. Use forum.start_debate_async with preset: "${preset_id}" to use it.`,
    });
  },
);
```

### Step 5: Run all tests

```bash
npm test
```

Expected: All tests PASS.

### Step 6: Commit

```bash
git add src/config/presets.ts src/server.ts tests/config/presets.test.ts tests/server/server-tools.test.ts
git commit -m "feat: add save_preset MCP tool for user-created debate configurations"
```

---

## Task 6: TUI Preset Picker — Standalone Mode

**Files:**
- Modify: `src/tui-opentui/index.tsx`
- Create: `src/tui-opentui/components/PresetPicker.tsx`
- Modify: `src/tui-opentui/App.tsx` (add `AppMode` type, conditional render)

When launched without a `topicId`, show an interactive preset picker that lets the user enter a topic and select a preset, then starts the debate and switches to the live view.

### Step 1: Implement `PresetPicker.tsx`

```tsx
// src/tui-opentui/components/PresetPicker.tsx
import React, { useState } from 'react';
// @ts-ignore
import { useKeyboard } from '@opentui/react';
import type { PresetSummary } from '../../config/presets.js';

export type PresetPickerProps = {
  presets: PresetSummary[];
  onStart: (topic: string, presetId: string) => void;
};

export const PresetPicker: React.FC<PresetPickerProps> = ({ presets, onStart }) => {
  const [phase, setPhase] = useState<'topic' | 'preset'>('topic');
  const [topic, setTopic] = useState('');
  const [selectedPresetIdx, setSelectedPresetIdx] = useState(0);

  useKeyboard((key: { name: string; sequence?: string }) => {
    if (phase === 'topic') {
      if (key.name === 'return' && topic.trim()) {
        setPhase('preset');
      } else if (key.name === 'backspace') {
        setTopic(prev => prev.slice(0, -1));
      } else if (key.sequence && key.sequence.length === 1 && !key.name.startsWith('ctrl')) {
        setTopic(prev => prev + key.sequence);
      }
    } else if (phase === 'preset') {
      if (key.name === 'up') {
        setSelectedPresetIdx(prev => Math.max(0, prev - 1));
      } else if (key.name === 'down') {
        setSelectedPresetIdx(prev => Math.min(presets.length - 1, prev + 1));
      } else if (key.name === 'return') {
        onStart(topic.trim(), presets[selectedPresetIdx].id);
      } else if (key.name === 'escape') {
        setPhase('topic');
      }
    }
  });

  return (
    <box style={{ flexDirection: 'column', padding: 2, width: '100%', height: '100%' }}>
      <text style={{ bold: true, color: '#7aa2f7', marginBottom: 1 }}>
        ⬡ AGORA — Multi-Agent Debate Launcher
      </text>

      {phase === 'topic' && (
        <box style={{ flexDirection: 'column' }}>
          <text style={{ color: '#c0caf5' }}>Enter debate topic or question:</text>
          <box style={{ borderStyle: 'single', borderColor: '#7aa2f7', marginTop: 1, padding: 1, width: '80%' }}>
            <text style={{ color: '#e0af68' }}>{topic}<text style={{ color: '#7aa2f7' }}>█</text></text>
          </box>
          <text style={{ color: '#565f89', marginTop: 1 }}>Press Enter to continue · Ctrl+C to quit</text>
        </box>
      )}

      {phase === 'preset' && (
        <box style={{ flexDirection: 'column' }}>
          <text style={{ color: '#9ece6a', marginBottom: 1 }}>Topic: {topic}</text>
          <text style={{ color: '#c0caf5', marginBottom: 1 }}>Select debate format:</text>
          {presets.map((p, i) => (
            <box key={p.id} style={{ flexDirection: 'row', marginBottom: 0 }}>
              <text style={{ color: i === selectedPresetIdx ? '#7aa2f7' : '#565f89', width: 2 }}>
                {i === selectedPresetIdx ? '▶' : ' '}
              </text>
              <box style={{ flexDirection: 'column', marginLeft: 1 }}>
                <text style={{ color: i === selectedPresetIdx ? '#e0af68' : '#c0caf5', bold: i === selectedPresetIdx }}>
                  {p.id.padEnd(14)} — {p.name} ({p.agent_count} agents)
                </text>
                <text style={{ color: '#565f89' }}>  {p.description}</text>
              </box>
            </box>
          ))}
          <text style={{ color: '#565f89', marginTop: 1 }}>↑↓ navigate · Enter to start · Esc to go back</text>
        </box>
      )}
    </box>
  );
};
```

### Step 2: Update `src/tui-opentui/index.tsx` for standalone mode

Replace the early-exit `if (!topicId)` block with a flow that:
1. Loads presets from `.agora/presets.json`
2. If no `topicId`, shows the `PresetPicker`
3. On preset selection, calls MCP `forum.start_debate_async` (or calls the controller directly) to start the debate
4. Switches to live debate view with the new topicId

The key change in `index.tsx`:

```typescript
// Replace the error-exit block:
if (!topicId) {
  // Show preset picker — handled inside runTUI
  await runTUI(null, store, controller, availableModels, agoraDir, providers, moderatorModel);
} else {
  await runTUI(topicId, store, controller, availableModels, agoraDir, providers, moderatorModel);
}
```

Update `runTUI` signature and `App.tsx` to handle `topicId: string | null`.

### Step 3: Update `App.tsx` to support picker → debate transition

```tsx
// Add to AppProps:
type AppMode = { kind: 'picker' } | { kind: 'debate'; topicId: string };

// App state:
const [mode, setMode] = useState<AppMode>(
  topicId ? { kind: 'debate', topicId } : { kind: 'picker' }
);

// In render:
if (mode.kind === 'picker') {
  return (
    <PresetPicker
      presets={presets}
      onStart={async (topic, presetId) => {
        // Start debate and switch mode
        const newTopicId = await startDebate(topic, presetId); 
        setMode({ kind: 'debate', topicId: newTopicId });
      }}
    />
  );
}
// ... existing debate UI
```

The `startDebate` function calls the controller / store directly (same as the MCP server does) to avoid needing an MCP client in the TUI.

### Step 4: Manual verification

```bash
bun run src/tui-opentui/index.tsx
```

Expected:
- Shows topic input prompt
- After entering topic + Enter, shows preset list
- After selecting preset + Enter, shows "Starting debate..." then switches to live debate view

### Step 5: Commit

```bash
git add src/tui-opentui/index.tsx src/tui-opentui/App.tsx src/tui-opentui/components/PresetPicker.tsx
git commit -m "feat: add TUI preset picker for standalone debate launch without topicId"
```

---

## Task 7: Final Verification

**Files:** None new

### Step 1: Run full test suite

```bash
npm test
```

Expected: All tests PASS (197 + new tests from Tasks 2, 3, 5).

### Step 2: Build

```bash
npm run build
```

Expected: Clean build, no TypeScript errors.

### Step 3: End-to-end smoke test via slash command

In OpenCode, type:
```
/debate Should we adopt a monorepo structure?
```

Verify:
- Agent offers preset selection
- Agent calls `forum.list_presets` → shows presets
- User picks a preset → agent calls `forum.start_debate_async`
- Agent provides TUI launch command
- TUI runs and shows live debate

### Step 4: End-to-end smoke test via standalone TUI

```bash
bun run src/tui-opentui/index.tsx
```

Verify:
- Preset picker shows
- Can navigate with arrow keys
- Enter launches debate and switches to live view

### Step 5: Final commit

```bash
git add -A
git commit -m "feat: complete plugin integration — preset system, MCP tools, /debate command, and TUI picker"
```

---

## Summary

| Task | New Files | Key Change |
|------|-----------|------------|
| 1 | `.agora/roles.json`, `.agora/presets.json` | Data: 10 roles, 6 presets |
| 2 | `src/config/presets.ts`, `tests/config/presets.test.ts` | Preset loader module, smart defaults |
| 3 | — (modify server.ts) | 3 new MCP tools + preset param in start_debate_async |
| 4 | `debate.md` (OpenCode commands dir) | `/debate` slash command |
| 5 | — (modify presets.ts + server.ts) | `forum.save_preset` MCP tool |
| 6 | `PresetPicker.tsx` (modify App.tsx, index.tsx) | Standalone TUI launcher |
| 7 | — | Final verification |

**Parallelizable:** Tasks 1 and 4 can be done together (pure JSON/markdown). Task 2 must precede Task 3. Tasks 4 and 5 can be done in parallel with Task 6.
