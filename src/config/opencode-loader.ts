// src/config/opencode-loader.ts
// Reads OpenCode's opencode.json to resolve provider baseURL + apiKey.

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { OpenCodeConfig, ResolvedProvider } from "../blackboard/types.js";

/**
 * Locate the opencode.json config file.
 * Search order:
 *   1. OPENCODE_CONFIG env var
 *   2. ~/.config/opencode/opencode.json
 */
function getOpenCodeConfigPath(): string {
  if (process.env.OPENCODE_CONFIG) {
    return process.env.OPENCODE_CONFIG;
  }
  return path.join(os.homedir(), ".config", "opencode", "opencode.json");
}

/**
 * Resolve an apiKey value from opencode.json.
 * Handles the "{env:VAR_NAME}" pattern and literal strings.
 */
function resolveApiKey(raw: string): string {
  const envMatch = raw.match(/^\{env:(.+)\}$/);
  if (envMatch) {
    const envVar = envMatch[1];
    const value = process.env[envVar];
    if (!value) {
      throw new Error(`OpenCode config references env var ${envVar} but it is not set`);
    }
    return value;
  }
  // Literal API key
  return raw;
}

/**
 * Represents an available model from a provider.
 */
export interface AvailableModel {
  id: string;
  name: string;
  provider: string;
}

/**
 * Parse the model string "provider/model" into its components.
 */
export function parseModelId(fullModelId: string): { provider: string; model: string } {
  const slashIdx = fullModelId.indexOf("/");
  if (slashIdx === -1) {
    throw new Error(
      `Invalid model ID "${fullModelId}": must be "provider/model" format (e.g. "lilith/claude-opus-4-6")`
    );
  }
  return {
    provider: fullModelId.slice(0, slashIdx),
    model: fullModelId.slice(slashIdx + 1),
  };
}

/**
 * Load and parse the OpenCode configuration file.
 */
export async function loadOpenCodeConfig(): Promise<OpenCodeConfig> {
  const configPath = getOpenCodeConfigPath();
  try {
    const raw = await fs.readFile(configPath, "utf-8");
    return JSON.parse(raw) as OpenCodeConfig;
  } catch (err) {
    throw new Error(
      `Failed to load OpenCode config from ${configPath}: ${err instanceof Error ? err.message : err}`
    );
  }
}

/**
 * Build a map of provider name → ResolvedProvider from the OpenCode config.
 * Resolves "{env:VAR}" patterns in apiKey values.
 */
export function resolveProviders(config: OpenCodeConfig): Map<string, ResolvedProvider> {
  const providers = new Map<string, ResolvedProvider>();

  for (const [name, entry] of Object.entries(config.provider)) {
    providers.set(name, {
      baseURL: entry.options.baseURL,
      apiKey: resolveApiKey(entry.options.apiKey),
    });
  }

  return providers;
}

/**
 * List all available models from the OpenCode config.
 * Iterates over all providers and their models, building an array of AvailableModel entries.
 */
export function listAvailableModels(config: OpenCodeConfig): AvailableModel[] {
  const models: AvailableModel[] = [];

  for (const [providerKey, entry] of Object.entries(config.provider)) {
    for (const [modelKey, modelInfo] of Object.entries(entry.models)) {
      models.push({
        id: `${providerKey}/${modelKey}`,
        name: modelInfo.name,
        provider: providerKey,
      });
    }
  }

  return models;
}

/**
 * Resolve a fully qualified model ID to a provider connection.
 * Given "lilith/claude-opus-4-6", looks up "lilith" in the provider map.
 */
export function resolveModelProvider(
  fullModelId: string,
  providers: Map<string, ResolvedProvider>,
): { provider: ResolvedProvider; modelName: string } {
  const { provider: providerKey, model: modelName } = parseModelId(fullModelId);
  const provider = providers.get(providerKey);
  if (!provider) {
    throw new Error(
      `Provider "${providerKey}" not found in OpenCode config. Available: ${[...providers.keys()].join(", ")}`
    );
  }
  return { provider, modelName };
}
