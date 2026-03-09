import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import path from "node:path";
import { createAgoraServer } from "./server.js";
import { BlackboardStore } from "./blackboard/store.js";
import { loadOpenCodeConfig, resolveProviders } from "./config/opencode-loader.js";
import { logger } from "./utils/logger.js";

/** Default moderator model (fully qualified). Override via AGORA_MODERATOR_MODEL env. */
const DEFAULT_MODERATOR_MODEL = "lilith/claude-opus-4-6";

async function main() {
  const agoraDir = process.env.AGORA_DIR ?? path.join(process.cwd(), ".agora");
  logger.info(`Starting Agora MCP server, data dir: ${agoraDir}`);

  // Load provider config from OpenCode's opencode.json
  const openCodeConfig = await loadOpenCodeConfig();
  const providers = resolveProviders(openCodeConfig);
  logger.info(`Loaded ${providers.size} provider(s) from OpenCode config: ${[...providers.keys()].join(", ")}`);

  const moderatorModel = process.env.AGORA_MODERATOR_MODEL ?? DEFAULT_MODERATOR_MODEL;

  const store = new BlackboardStore(agoraDir);
  await store.init();

  const server = createAgoraServer({ store, agoraDir, providers, moderatorModel });
  const transport = new StdioServerTransport();

  await server.connect(transport);
  logger.info("Agora MCP server connected via stdio");
}

main().catch((err) => {
  process.stderr.write(`[agora:fatal] ${err}\n`);
  process.exit(1);
});
