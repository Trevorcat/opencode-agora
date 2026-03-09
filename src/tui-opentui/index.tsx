#!/usr/bin/env bun
import { parseArgs } from 'node:util';
import path from 'node:path';
import { runTUI } from './App.js';
import { BlackboardStore } from '../blackboard/store.js';
import { DebateController } from '../moderator/controller.js';
import { loadOpenCodeConfig, resolveProviders, listAvailableModels } from '../config/opencode-loader.js';
import type { AvailableModel } from '../config/opencode-loader.js';
import { listPresets } from '../config/presets.js';
import type { PresetSummary } from '../config/presets.js';
import { logger } from '../utils/logger.js';

async function main() {
  const { values, positionals } = parseArgs({
    options: {
      topicId: { type: 'string', short: 't' },
    },
    allowPositionals: true,
  });

  // Get topicId from args or positional (optional now - can launch without for preset picker)
  const topicId = values.topicId || positionals[0] || null;

  const agoraDir = process.env.AGORA_DIR || path.join(process.cwd(), '.agora');
  logger.info(`Starting Agora TUI for topic: ${topicId}`);

  // Load provider configuration and available models
  let providers;
  let availableModels: AvailableModel[] = [];
  try {
    const openCodeConfig = await loadOpenCodeConfig();
    providers = resolveProviders(openCodeConfig);
    availableModels = listAvailableModels(openCodeConfig);
    logger.info(`Loaded ${providers.size} provider(s), ${availableModels.length} model(s)`);
  } catch (error) {
    logger.error('Failed to load OpenCode config, using empty providers:', error);
    providers = new Map();
  }

  // Load presets for picker mode
  let presets: PresetSummary[] = [];
  try {
    presets = await listPresets(agoraDir);
  } catch (error) {
    logger.debug('Failed to load presets:', error);
  }

  // Initialize store
  const store = new BlackboardStore(agoraDir);
  await store.init();

  // Initialize controller
  const controller = new DebateController({
    store,
    providers,
    retryOpts: {
      maxAttempts: 3,
      baseDelayMs: 1_000,
    },
    timeoutMs: 60_000,
  });

  // Run the OpenTUI app
  await runTUI(topicId, store, controller, availableModels, presets, agoraDir, providers);
}

main().catch((err) => {
  console.error('Fatal initialization error:', err);
  process.exit(1);
});
