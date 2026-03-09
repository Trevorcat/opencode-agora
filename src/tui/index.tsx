#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { parseArgs } from 'node:util';
import path from 'node:path';
import { App } from './App.js';
import { BlackboardStore } from '../blackboard/store.js';
import { DebateController } from '../moderator/controller.js';
import { loadOpenCodeConfig, resolveProviders } from '../config/opencode-loader.js';
import { logger } from '../utils/logger.js';

async function main() {
  const { values, positionals } = parseArgs({
    options: {
      topicId: { type: 'string', short: 't' },
    },
    allowPositionals: true,
  });

  // Get topicId from args or positional
  const topicId = values.topicId || positionals[0];
  
  if (!topicId) {
    console.error('Usage: opencode-agora-tui <topicId>');
    console.error('   or: opencode-agora-tui -t <topicId>');
    process.exit(1);
  }

  const agoraDir = process.env.AGORA_DIR || path.join(process.cwd(), '.agora');
  logger.info(`Starting Agora TUI for topic: ${topicId}`);

  // Load provider configuration
  let providers;
  try {
    const openCodeConfig = await loadOpenCodeConfig();
    providers = resolveProviders(openCodeConfig);
    logger.info(`Loaded ${providers.size} provider(s)`);
  } catch (error) {
    logger.error('Failed to load OpenCode config, using empty providers:', error);
    providers = new Map();
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

  const { clear } = render(<App topicId={topicId} store={store} controller={controller} />);
  
  // Clean exit handling
  process.on('SIGINT', () => {
    clear();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    clear();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Fatal initialization error:', err);
  process.exit(1);
});
