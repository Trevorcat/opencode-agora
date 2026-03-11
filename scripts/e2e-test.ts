#!/usr/bin/env bun
/**
 * End-to-end test: Start a real debate with live LLM calls.
 * 
 * Usage:
 *   bun run scripts/e2e-test.ts
 * 
 * Then in another terminal:
 *   bun run src/tui-opentui/index.tsx <topicId>
 */

import path from 'node:path';
import crypto from 'node:crypto';
import { BlackboardStore } from '../src/blackboard/store.js';
import { DebateController } from '../src/moderator/controller.js';
import { ConsensusSynthesizer } from '../src/consensus/synthesizer.js';
import { OpenCodeHttpClient } from '../src/agents/opencode-http-client.js';
import { loadAgentConfig } from '../src/agents/default-personas.js';
import type { Topic, ProgressEvent } from '../src/blackboard/types.js';

const QUESTION = "Should software teams adopt AI code assistants (like GitHub Copilot, Cursor, OpenCode) as standard tooling? Consider productivity, code quality, security risks, and developer skill development.";

function generateTopicId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = crypto.randomBytes(3).toString('hex');
  return `topic_${date}_${rand}`;
}

async function main() {
  console.log('=== OpenCode Agora E2E Test ===\n');
  
  // 1. Discover OpenCode URL
  console.log('[1/6] Discovering OpenCode server URL...');
  const opencodeUrl = await OpenCodeHttpClient.discoverUrl();
  console.log(`  URL: ${opencodeUrl}`);

  // 2. Load agents
  const agoraDir = path.join(process.cwd(), '.agora');
  console.log('\n[2/6] Loading agent config...');
  const agents = await loadAgentConfig(agoraDir);
  console.log(`  Agents: ${agents.map(a => `${a.role} (${a.model})`).join(', ')}`);
  
  // 3. Initialize store
  console.log('\n[3/6] Initializing store...');
  const store = new BlackboardStore(agoraDir);
  await store.init();
  
  // 4. Create topic
  const topicId = generateTopicId();
  console.log(`\n[4/6] Creating topic: ${topicId}`);
  console.log(`  Question: ${QUESTION.slice(0, 80)}...`);
  
  const topic: Topic = {
    id: topicId,
    question: QUESTION,
    status: 'pending',
    config: {
      max_rounds: 3,
      consensus_threshold: 0.66,
      agents,
    },
    created_at: new Date().toISOString(),
  };
  await store.saveTopic(topic);
  
  console.log(`\n  >>> TUI command: bun run src/tui-opentui/index.tsx ${topicId}`);
  console.log('  >>> Open another terminal and run the above to watch live!\n');
  
  // Give user a moment to start TUI
  console.log('  Starting debate in 5 seconds...');
  await new Promise(r => setTimeout(r, 5000));
  
  // 5. Run debate
  console.log('\n[5/6] Running debate (3 rounds + voting)...');
  const startTime = Date.now();
  
  const controller = new DebateController({
    store,
    opencodeUrl,
    directory: process.cwd(),
    retryOpts: {
      maxAttempts: 3,
      baseDelayMs: 1_000,
    },
    timeoutMs: 120_000, // 2 min timeout per agent
    onProgress: async (event: ProgressEvent) => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      switch (event.type) {
        case 'debate_started':
          console.log(`  [${elapsed}s] Debate started`);
          break;
        case 'round_started':
          console.log(`  [${elapsed}s] Round ${(event as any).round} started`);
          break;
        case 'agent_thinking':
          console.log(`  [${elapsed}s] ${(event as any).agent} thinking... (${(event as any).model})`);
          break;
        case 'agent_stream':
          // Don't log every chunk, too noisy
          break;
        case 'agent_posted': {
          const post = (event as any).post;
          console.log(`  [${elapsed}s] ${post.role} posted (confidence: ${post.confidence})`);
          console.log(`    Position: ${post.position.slice(0, 100)}...`);
          break;
        }
        case 'round_complete':
          console.log(`  [${elapsed}s] Round ${(event as any).round} complete (${(event as any).posts.length} posts)`);
          break;
        case 'voting_started':
          console.log(`  [${elapsed}s] Voting phase started`);
          break;
        case 'vote_cast': {
          const vote = (event as any).vote;
          console.log(`  [${elapsed}s] ${vote.role} voted: ${vote.chosen_position.slice(0, 60)}...`);
          break;
        }
        case 'agent_error':
          console.log(`  [${elapsed}s] ERROR: ${(event as any).agent}: ${(event as any).error}`);
          break;
        case 'debate_complete':
          console.log(`  [${elapsed}s] Debate complete!`);
          break;
        case 'error':
          console.log(`  [${elapsed}s] DEBATE ERROR: ${(event as any).message}`);
          break;
        default:
          console.log(`  [${elapsed}s] ${event.type}`);
      }
    },
  });

  try {
    await controller.runDebate({
      topicId,
      question: QUESTION,
      agents,
      enablePause: false,
      enableGuidance: false,
    });
  } catch (error) {
    console.error('\n  DEBATE FAILED:', error);
    process.exit(1);
  }

  // 6. Synthesize consensus
  console.log('\n[6/6] Synthesizing consensus...');
  const moderatorModel = 'lilith/qwen3.5-plus';
  
  const votes = await store.getVotes(topicId);
  const allPosts = await Promise.all([1, 2, 3].map(round => store.getRoundPosts(topicId, round)));
  
  const synthesizer = new ConsensusSynthesizer({
    opencodeUrl,
    directory: process.cwd(),
    moderatorModel,
  });
  
  const consensus = await synthesizer.synthesize({
    topicId,
    question: QUESTION,
    votes,
    allPosts,
    roundsTaken: 3,
  });
  
  await store.saveConsensus(topicId, consensus);
  await store.saveTopic({
    ...topic,
    status: 'completed',
    completed_at: new Date().toISOString(),
  });

  // Print results
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n' + '='.repeat(60));
  console.log('DEBATE COMPLETE');
  console.log('='.repeat(60));
  console.log(`Topic ID: ${topicId}`);
  console.log(`Duration: ${totalTime}s`);
  console.log(`Confidence: ${consensus.confidence}`);
  console.log(`\nConclusion:\n${consensus.conclusion}`);
  console.log(`\nKey Arguments:\n${consensus.key_arguments.map(p => `  - ${p}`).join('\n')}`);
  if (consensus.dissenting_views?.length) {
    console.log(`\nDissenting Views:\n${consensus.dissenting_views.map(d => `  - ${d}`).join('\n')}`);
  }
  console.log('\n' + '='.repeat(60));
  console.log(`\nView in TUI: bun run src/tui-opentui/index.tsx ${topicId}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
