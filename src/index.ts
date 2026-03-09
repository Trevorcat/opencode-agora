import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createAgoraServer } from "./server.js";
import { BlackboardStore } from "./blackboard/store.js";
import type { AgoraConfig } from "./blackboard/types.js";
import { logger } from "./utils/logger.js";

async function loadConfig(agoraDir: string): Promise<AgoraConfig | undefined> {
  const configPath = path.join(agoraDir, "config.json");
  try {
    const raw = await fs.readFile(configPath, "utf-8");
    return JSON.parse(raw) as AgoraConfig;
  } catch {
    logger.info(`No config.json found at ${configPath}, using defaults`);
    return undefined;
  }
}

async function main() {
  const agoraDir = process.env.AGORA_DIR ?? path.join(process.cwd(), ".agora");
  logger.info(`Starting Agora MCP server, data dir: ${agoraDir}`);

  const config = await loadConfig(agoraDir);
  const store = new BlackboardStore(agoraDir);
  await store.init();

  const server = createAgoraServer({ store, agoraDir, config });
  const transport = new StdioServerTransport();

  await server.connect(transport);
  logger.info("Agora MCP server connected via stdio");
}

main().catch((err) => {
  process.stderr.write(`[agora:fatal] ${err}\n`);
  process.exit(1);
});
