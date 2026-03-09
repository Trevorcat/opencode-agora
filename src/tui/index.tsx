#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { parseArgs } from 'node:util';
import { App, BlackboardStore, DebateController } from './App.js';

// Mock config loader for this context
const loadConfig = async () => ({
  providers: []
});

async function main() {
  const { values } = parseArgs({
    options: {
      topicId: { type: 'string', short: 't' },
    },
    allowPositionals: true,
  });

  const topicId = values.topicId || 'nexus-convergence';

  // Load configuration and initialize core subsystems
  await loadConfig();

  // Basic mocks to allow running standalone TUI tests
  const store: BlackboardStore = {
    getState: () => ({}),
    subscribe: () => () => {},
  };

  let controllerStatus: 'Running' | 'Paused' | 'Stopped' = 'Running';
  const controller: DebateController = {
    pause: () => { controllerStatus = 'Paused'; },
    resume: () => { controllerStatus = 'Running'; },
    injectGuidance: (g) => console.log('Injected:', g),
    getStatus: () => controllerStatus,
  };

  const { clear } = render(<App topicId={topicId} store={store} controller={controller} />);
  
  // Clean exit handling
  process.on('SIGINT', () => {
    clear();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Fatal initialization error:', err);
  process.exit(1);
});
