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
  opts: { agentCount?: number } = {}
): Promise<AgentConfig[]> {
  const [catalog, roles] = await Promise.all([
    loadPresets(agoraDir),
    loadRoles(agoraDir),
  ]);

  const preset = catalog[presetId];
  if (!preset) {
    throw new Error(
      `Preset "${presetId}" not found. Available: ${Object.keys(catalog).join(", ")}`
    );
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
  agents: Array<{ role: string; persona?: string; model?: string }>
): Promise<AgentConfig[]> {
  const roles = await loadRoles(agoraDir);
  return agents.map((a) => resolveAgentDef(a, roles));
}

/**
 * Save or update a preset in presets.json.
 */
export async function savePreset(
  agoraDir: string,
  presetId: string,
  entry: PresetEntry
): Promise<void> {
  const catalog = await loadPresets(agoraDir);
  catalog[presetId] = entry;
  const filePath = path.join(agoraDir, "presets.json");
  await fs.writeFile(filePath, JSON.stringify(catalog, null, 2), "utf-8");
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function resolveAgentDef(
  def: PresetAgentDef,
  roles: RoleCatalog
): AgentConfig {
  const roleEntry = roles[def.role];
  const persona =
    def.persona ??
    roleEntry?.persona ??
    `You are debating as the "${def.role}" perspective. Provide thoughtful analysis from this viewpoint.`;
  const model = def.model ?? roleEntry?.default_model ?? SYSTEM_DEFAULT_MODEL;
  return { role: def.role, persona, model };
}
