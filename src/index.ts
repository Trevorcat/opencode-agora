import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import path from "node:path";
import { createAgoraServer } from "./server.js";
import { BlackboardStore } from "./blackboard/store.js";
import { loadOpenCodeConfig, listAvailableModels } from "./config/opencode-loader.js";
import { OpenCodeHttpClient } from "./agents/opencode-http-client.js";
import { logger } from "./utils/logger.js";

/** Default moderator model (fully qualified). Override via AGORA_MODERATOR_MODEL env. */
const DEFAULT_MODERATOR_MODEL = "local/Qwen/Qwen3.5-27B-FP8";

async function main() {
  const agoraDir = process.env.AGORA_DIR ?? path.join(process.cwd(), ".agora");
  const directory = process.cwd();

  logger.info(`Starting Agora MCP server, data dir: ${agoraDir}`);

  // Discover OpenCode service URL (auto-detects via OPENCODE_PID, port probe, or env var)
  const opencodeUrl = await OpenCodeHttpClient.discoverUrl();
  logger.info(`OpenCode service URL: ${opencodeUrl}`);

  // Load available models list from OpenCode config (for forum.list_models tool)
  const openCodeConfig = await loadOpenCodeConfig();
  const availableModels = listAvailableModels(openCodeConfig);
  logger.info(`${availableModels.length} models available`);

  const moderatorModel = process.env.AGORA_MODERATOR_MODEL ?? DEFAULT_MODERATOR_MODEL;

  const store = new BlackboardStore(agoraDir);
  await store.init();

  const server = createAgoraServer({
    store,
    agoraDir,
    opencodeUrl,
    directory,
    moderatorModel,
    availableModels,
  });
  const transport = new StdioServerTransport();

  await server.connect(transport);
  logger.info("Agora MCP server connected via stdio");
}

main().catch((err) => {
  process.stderr.write(`[agora:fatal] ${err}\n`);
  process.exit(1);
});
