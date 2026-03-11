/**
 * E2E test: async debate via server.ts tool handlers (simulates MCP behavior)
 * Tests: start_debate_async → get_live_status → pause → resume → inject_guidance → get_consensus
 */
import path from 'node:path';
import { BlackboardStore } from './dist/blackboard/store.js';
import { createAgoraServer } from './dist/server.js';
import { OpenCodeHttpClient } from './dist/agents/opencode-http-client.js';

const agoraDir = path.join(process.cwd(), '.agora');
const url = await OpenCodeHttpClient.discoverUrl();
console.log('[setup] OpenCode URL:', url);

const store = new BlackboardStore(agoraDir);
await store.init();

// Simulate the MCP server's tool handler by calling createAgoraServer internals
// We'll drive it by directly using DebateController + ConsensusSynthesizer like server.ts does
import { DebateController } from './dist/moderator/controller.js';
import { ConsensusSynthesizer } from './dist/consensus/synthesizer.js';
import crypto from 'node:crypto';

function topicId() {
  return `topic_e2e_${new Date().toISOString().slice(0,10).replace(/-/g,'')}_${crypto.randomBytes(3).toString('hex')}`;
}

const TOPIC = topicId();
const QUESTION = '远程工作比办公室工作更有生产力吗？';
const AGENTS = [
  { role: 'remote_advocate', model: 'local/Qwen/Qwen3.5-27B-FP8', persona: '支持远程工作，强调自由度和效率' },
  { role: 'office_advocate', model: 'local/Qwen/Qwen3.5-27B-FP8', persona: '支持办公室工作，强调协作和文化' },
];
const MODERATOR = 'local/Qwen/Qwen3.5-27B-FP8';

const results = { passed: [], failed: [] };
function pass(name) { results.passed.push(name); console.log(`  ✅ ${name}`); }
function fail(name, err) { results.failed.push(name); console.error(`  ❌ ${name}: ${err}`); }

// ── Test 1: start_debate_async ────────────────────────────────────────────────
console.log('\n[T1] start_debate_async');
const controller = new DebateController({
  store, opencodeUrl: url, directory: process.cwd(),
  retryOpts: { maxAttempts: 2, baseDelayMs: 500 },
  timeoutMs: 120_000,
  onProgress: (ev) => {
    if (['round_started','agent_posted','vote_cast','debate_complete','error'].includes(ev.type)) {
      const extra =
        ev.type === 'agent_posted'   ? ` [${ev.post.role}] "${ev.post.position.slice(0,40)}..."` :
        ev.type === 'vote_cast'      ? ` ${ev.vote.role}→${ev.vote.chosen_position.slice(0,30)}` :
        ev.type === 'error'          ? ` ❌ ${ev.message}` : '';
      process.stdout.write(`  » ${ev.type}${extra}\n`);
    }
  },
});

const asyncResult = controller.runDebateAsync({ topicId: TOPIC, question: QUESTION, agents: AGENTS });
if (asyncResult.topicId === TOPIC && typeof asyncResult.abort === 'function') {
  pass('runDebateAsync returns immediately with topicId + abort');
} else {
  fail('runDebateAsync', 'missing topicId or abort');
}

// ── Test 2: pause after round 1 ───────────────────────────────────────────────
console.log('\n[T2] pause after ~25s (mid-debate)');
await new Promise(r => setTimeout(r, 25000));
try {
  await controller.pauseDebate(TOPIC, 'e2e test pause');
  const status = await store.getLiveStatus(TOPIC);
  const isPaused = status?.status === 'paused' || await store.isPaused(TOPIC);
  if (isPaused) {
    pass('pauseDebate sets pause state');
  } else {
    fail('pauseDebate', `status=${status?.status}, isPaused=${await store.isPaused(TOPIC)}`);
  }
} catch (e) { fail('pauseDebate', e.message); }

// ── Test 3: inject guidance while paused ─────────────────────────────────────
console.log('\n[T3] inject guidance');
try {
  await controller.injectGuidance(TOPIC, '请重点考虑心理健康和工作生活平衡因素', {
    pinToBlackboard: true,
  });
  const status = await store.getLiveStatus(TOPIC);
  if (status?.pending_guidance > 0) {
    pass('injectGuidance adds pending guidance');
  } else {
    fail('injectGuidance', `pending_guidance=${status?.pending_guidance}`);
  }
} catch (e) { fail('injectGuidance', e.message); }

// ── Test 4: resume ────────────────────────────────────────────────────────────
console.log('\n[T4] resume debate');
try {
  await controller.resumeDebate(TOPIC);
  const status = await store.getLiveStatus(TOPIC);
  const stillPaused = await store.isPaused(TOPIC);
  if (!stillPaused && status?.status !== 'paused') {
    pass('resumeDebate clears pause state');
  } else {
    fail('resumeDebate', `status=${status?.status}, isPaused=${stillPaused}`);
  }
} catch (e) { fail('resumeDebate', e.message); }

// ── Wait for debate_complete ──────────────────────────────────────────────────
console.log('\n[wait] Waiting for debate to finish...');
await asyncResult.promise;
console.log('  debate promise resolved');

// ── Test 5: verify all rounds have posts ─────────────────────────────────────
console.log('\n[T5] verify round data');
try {
  const r1 = await store.getRoundPosts(TOPIC, 1);
  const r2 = await store.getRoundPosts(TOPIC, 2);
  const r3 = await store.getRoundPosts(TOPIC, 3);
  if (r1.length === 2 && r2.length === 2 && r3.length === 2) {
    pass(`all 3 rounds have 2 posts each (${r1.length}/${r2.length}/${r3.length})`);
  } else {
    fail('round data', `posts: ${r1.length}/${r2.length}/${r3.length}`);
  }
} catch (e) { fail('round data', e.message); }

// ── Test 6: votes ─────────────────────────────────────────────────────────────
console.log('\n[T6] verify votes');
try {
  const votes = await store.getVotes(TOPIC);
  if (votes.length === 2) {
    pass(`2 votes recorded (${votes.map(v => v.role).join(', ')})`);
  } else {
    fail('votes', `got ${votes.length} votes`);
  }
} catch (e) { fail('votes', e.message); }

// ── Test 7: consensus synthesis ───────────────────────────────────────────────
console.log('\n[T7] consensus synthesis');
try {
  const votes    = await store.getVotes(TOPIC);
  const allPosts = await Promise.all([1,2,3].map(r => store.getRoundPosts(TOPIC, r)));
  const synth = new ConsensusSynthesizer({ opencodeUrl: url, directory: process.cwd(), moderatorModel: MODERATOR });
  const consensus = await synth.synthesize({ topicId: TOPIC, question: QUESTION, votes, allPosts, roundsTaken: 3 });
  await store.saveConsensus(TOPIC, consensus);

  if (consensus.conclusion && consensus.confidence > 0) {
    pass(`consensus generated (confidence=${consensus.confidence})`);
    console.log(`  Conclusion: ${consensus.conclusion.slice(0,80)}...`);
  } else {
    fail('consensus', 'empty conclusion or zero confidence');
  }
} catch (e) { fail('consensus synthesis', e.message); }

// ── Test 8: getLiveStatus after completion ────────────────────────────────────
console.log('\n[T8] final status');
try {
  const meta = await store.getTopic(TOPIC);
  if (meta?.status === 'completed' || meta?.status === 'running') {
    // 'running' is acceptable here since we didn't call setTopicMetadata (that's server.ts's job)
    pass(`topic status: ${meta.status}`);
  } else {
    fail('final status', `status=${meta?.status}`);
  }
} catch (e) { fail('final status', e.message); }

// ── Test 9: blackboard has items ──────────────────────────────────────────────
console.log('\n[T9] blackboard');
try {
  const status = await store.getLiveStatus(TOPIC);
  const bbCount = status?.blackboard?.length ?? 0;
  if (bbCount > 0) {
    pass(`blackboard has ${bbCount} items`);
  } else {
    fail('blackboard', 'no items');
  }
} catch (e) { fail('blackboard', e.message); }

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(50));
console.log(`RESULTS: ${results.passed.length} passed, ${results.failed.length} failed`);
if (results.failed.length) {
  console.log('FAILED:', results.failed.join(', '));
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED ✅');
}
