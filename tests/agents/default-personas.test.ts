// tests/agents/default-personas.test.ts

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { loadAgentConfig, getDefaultAgents } from "../../src/agents/default-personas.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("loadAgentConfig", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "agora-test-"));
  });

  it("returns DEFAULT_AGENTS when file is absent", async () => {
    const result = await loadAgentConfig(tempDir);
    expect(result).toEqual(getDefaultAgents());
    expect(result.length).toBe(4);
  });

  it("returns loaded config when file is valid", async () => {
    const customAgents = [
      {
        role: "custom-role",
        persona: "Custom persona",
        model: "provider/model-name",
      },
    ];
    const configPath = join(tempDir, "agents.json");
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(configPath, JSON.stringify(customAgents))
    );

    const result = await loadAgentConfig(tempDir);
    expect(result).toEqual(customAgents);
    expect(result.length).toBe(1);
  });

  it("falls back to defaults when JSON is malformed", async () => {
    const configPath = join(tempDir, "agents.json");
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(configPath, "{ invalid json }")
    );

    const result = await loadAgentConfig(tempDir);
    expect(result).toEqual(getDefaultAgents());
    expect(result.length).toBe(4);
  });

  it("falls back to defaults when array has missing fields", async () => {
    const invalidAgents = [{ role: "test" }];
    const configPath = join(tempDir, "agents.json");
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(configPath, JSON.stringify(invalidAgents))
    );

    const result = await loadAgentConfig(tempDir);
    expect(result).toEqual(getDefaultAgents());
    expect(result.length).toBe(4);
  });

  it("falls back to defaults when model does not contain '/'", async () => {
    const invalidAgents = [
      {
        role: "test",
        persona: "test",
        model: "invalid-model-no-slash",
      },
    ];
    const configPath = join(tempDir, "agents.json");
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(configPath, JSON.stringify(invalidAgents))
    );

    const result = await loadAgentConfig(tempDir);
    expect(result).toEqual(getDefaultAgents());
    expect(result.length).toBe(4);
  });

  it("falls back to defaults when parsed JSON is not an array", async () => {
    const configPath = join(tempDir, "agents.json");
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(configPath, JSON.stringify({ role: "test" }))
    );

    const result = await loadAgentConfig(tempDir);
    expect(result).toEqual(getDefaultAgents());
    expect(result.length).toBe(4);
  });
});
