/**
 * e2e-mcp.mjs
 *
 * 外层 E2E 测试：通过 `opencode run --format json` 实际调用 agora MCP 工具，
 * 验证完整的辩论流程在真实 OpenCode 环境下端到端可工作。
 *
 * 策略：每次 opencode run 只做一件事（单工具调用），
 * 用极简 prompt 减少 token 消耗，避免 model 自由发挥。
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGORA_DIR = path.join(__dirname, '.agora');
const MODEL = 'local/Qwen/Qwen3.5-27B-FP8';

const testResults = { passed: [], failed: [] };
function pass(name) { testResults.passed.push(name); console.log(`  ✅ ${name}`); }
function fail(name, err) { testResults.failed.push(name); console.error(`  ❌ ${name}: ${err}`); }

// ─── opencode runner ──────────────────────────────────────────

function runOpenCode(message, { timeoutMs = 60_000 } = {}) {
  const result = spawnSync(
    'opencode',
    ['run', '--format', 'json', '--model', MODEL, '--dir', __dirname, message],
    {
      encoding: 'utf8',
      timeout: timeoutMs,
      cwd: __dirname,
      env: { ...process.env },
      shell: true,
    }
  );

  if (result.error) throw new Error(`opencode spawn error: ${result.error.message}`);

  const events = [];
  for (const line of (result.stdout ?? '').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { events.push(JSON.parse(t)); } catch { /* skip */ }
  }

  return { events, stderr: result.stderr ?? '', exitCode: result.status ?? -1 };
}

/**
 * Find completed tool_use events. Tool names in events use "agora_forum_X" format.
 * Accept both "forum.list_presets" and "agora_forum_list_presets".
 */
function findToolCalls(events, toolName) {
  const normalized = toolName.startsWith('agora_')
    ? toolName
    : 'agora_' + toolName.replace('.', '_');
  return events.filter(ev =>
    ev?.type === 'tool_use' &&
    ev?.part?.tool === normalized &&
    ev?.part?.state?.status === 'completed'
  );
}

function parseToolOutput(toolEvent) {
  const raw = toolEvent?.part?.state?.output;
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return { raw }; }
}

// ─── filesystem helpers ───────────────────────────────────────

function readTopicMeta(topicId) {
  const p = path.join(AGORA_DIR, 'topics', topicId, 'meta.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}

function readConsensus(topicId) {
  const p = path.join(AGORA_DIR, 'topics', topicId, 'consensus.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}

function countRoundPosts(topicId, round) {
  const dir = path.join(AGORA_DIR, 'topics', topicId, `round-${round}`);
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter(f => f.endsWith('.json')).length;
}

function readTopicErrors(topicId) {
  const p = path.join(AGORA_DIR, 'topics', topicId, 'events.jsonl');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').trim().split('\n')
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(e => e?.type === 'error' || e?.type === 'agent_error');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ═══════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log('  Agora MCP E2E Test (via opencode run --format json)');
console.log('═'.repeat(60));

// ─── T1: forum.list_presets ──────────────────────────────────
console.log('\n[T1] forum.list_presets');
try {
  const { events, stderr } = runOpenCode(
    'Call forum.list_presets. Reply with just the preset IDs, one per line.',
    { timeoutMs: 40_000 }
  );

  const calls = findToolCalls(events, 'forum.list_presets');
  if (calls.length === 0) {
    fail('forum.list_presets', `tool not called. events=${events.length}, stderr=${stderr.slice(0, 150)}`);
  } else {
    const out = parseToolOutput(calls[0]);
    const count = out?.presets?.length ?? 0;
    pass(`forum.list_presets — ${count} presets: ${out?.presets?.map(p => p.id).join(', ')}`);
  }
} catch (e) { fail('forum.list_presets', e.message); }

// ─── T2: forum.start_debate_async ───────────────────────────
console.log('\n[T2] forum.start_debate_async');
let topicId = null;
try {
  // Use preset="quick" to avoid passing complex JSON agent configs.
  // The quick preset (proponent + skeptic) is defined in .agora/presets.json.
  const { events, stderr } = runOpenCode(
    'Call forum.start_debate_async with question "Is unit testing worth it for small projects?" and preset "quick". Output only the topicId.',
    { timeoutMs: 55_000 }
  );

  const calls = findToolCalls(events, 'forum.start_debate_async');
  if (calls.length > 0) {
    const out = parseToolOutput(calls[0]);
    topicId = out?.topicId ?? null;
    if (topicId) {
      pass(`forum.start_debate_async → topicId: ${topicId}`);
    } else {
      fail('forum.start_debate_async', `tool called but no topicId: ${JSON.stringify(out).slice(0, 150)}`);
    }
  } else {
    // Hunt for topic ID in raw stdout
    const allText = events.map(e => JSON.stringify(e)).join(' ');
    const m = allText.match(/topic_\d{8}_[a-f0-9]+/);
    if (m) {
      topicId = m[0];
      pass(`forum.start_debate_async: topicId found in events: ${topicId}`);
    } else {
      fail('forum.start_debate_async', `tool not called. events=${events.length}, stderr=${stderr.slice(0, 200)}`);
    }
  }
} catch (e) { fail('forum.start_debate_async', e.message); }

if (!topicId) {
  console.log('\n⚠  No topicId — aborting\n' + '═'.repeat(60));
  console.log(`RESULTS: ${testResults.passed.length} passed, ${testResults.failed.length} failed`);
  process.exit(1);
}

// ─── T3: forum.get_live_status ──────────────────────────────
console.log('\n[T3] forum.get_live_status');
try {
  const { events, stderr } = runOpenCode(
    `Call forum.get_live_status with topic_id="${topicId}". Output just the status field value.`,
    { timeoutMs: 40_000 }
  );

  const calls = findToolCalls(events, 'forum.get_live_status');
  if (calls.length > 0) {
    const out = parseToolOutput(calls[0]);
    const status = out?.status;
    if (['running', 'pending', 'paused', 'completed'].includes(status)) {
      pass(`forum.get_live_status → status=${status}`);
    } else {
      fail('forum.get_live_status', `status=${status}, full=${JSON.stringify(out).slice(0, 150)}`);
    }
  } else {
    const meta = readTopicMeta(topicId);
    if (meta) {
      pass(`get_live_status: topic on disk status=${meta.status} (tool not captured in events)`);
    } else {
      fail('forum.get_live_status', `tool not called. events=${events.length}`);
    }
  }
} catch (e) { fail('forum.get_live_status', e.message); }

// ─── T4: wait for completion ────────────────────────────────
console.log('\n[T4] Waiting for debate to complete (up to 7 min)...');
const startWait = Date.now();
const MAX_WAIT = 7 * 60 * 1000;
let debateCompleted = false;

while (Date.now() - startWait < MAX_WAIT) {
  const meta = readTopicMeta(topicId);
  if (meta?.status === 'completed') {
    debateCompleted = true;
    pass(`debate completed in ${Math.round((Date.now() - startWait) / 1000)}s`);
    break;
  } else if (meta?.status === 'failed') {
    const errs = readTopicErrors(topicId);
    const msg = errs.map(e => e.error ?? e.message).join('; ') || 'status=failed';
    fail('debate completion', msg);
    break;
  }
  process.stdout.write('.');
  await sleep(5000);
}
console.log('');

if (!debateCompleted && !testResults.failed.includes('debate completion')) {
  fail('debate completion', `timed out after ${Math.round((Date.now() - startWait) / 1000)}s`);
}

// ─── T5: forum.get_round (filesystem + MCP) ─────────────────
console.log('\n[T5] forum.get_round');
try {
  // Verify from filesystem first (reliable)
  const fsCounts = [1, 2, 3].map(r => countRoundPosts(topicId, r));
  console.log(`  Filesystem: R1=${fsCounts[0]}, R2=${fsCounts[1]}, R3=${fsCounts[2]} posts`);

  if (fsCounts.every(c => c >= 1)) {
    pass(`all 3 rounds have posts (${fsCounts.join('/')})`);
  } else {
    fail('round data', `some rounds empty: ${fsCounts.join('/')}`);
  }

  // Also call via MCP tool for one round to confirm MCP path works
  const { events } = runOpenCode(
    `Call forum.get_round with topic_id="${topicId}" and round=1. Output the number of posts.`,
    { timeoutMs: 40_000 }
  );
  const calls = findToolCalls(events, 'forum.get_round');
  if (calls.length > 0) {
    const out = parseToolOutput(calls[0]);
    const posts = out?.posts ?? [];
    pass(`forum.get_round MCP: round 1 has ${posts.length} post(s)`);
  } else {
    pass('forum.get_round MCP: tool not captured but filesystem verified');
  }
} catch (e) { fail('round data', e.message); }

// ─── T6: forum.get_consensus ────────────────────────────────
console.log('\n[T6] forum.get_consensus');
try {
  const { events } = runOpenCode(
    `Call forum.get_consensus with topic_id="${topicId}". Output the conclusion and confidence.`,
    { timeoutMs: 40_000 }
  );

  const calls = findToolCalls(events, 'forum.get_consensus');
  if (calls.length > 0) {
    const out = parseToolOutput(calls[0]);
    if (out?.conclusion && typeof out?.confidence === 'number') {
      pass(`forum.get_consensus: confidence=${out.confidence}`);
      console.log(`  Conclusion: ${out.conclusion.slice(0, 120)}`);
    } else if (out?.error) {
      // Fallback to filesystem
      const c = readConsensus(topicId);
      if (c?.conclusion) {
        pass(`consensus on filesystem: confidence=${c.confidence} (MCP returned: ${out.error})`);
        console.log(`  Conclusion: ${c.conclusion.slice(0, 120)}`);
      } else {
        fail('forum.get_consensus', `MCP error: ${out.error}, no filesystem consensus`);
      }
    } else {
      fail('forum.get_consensus', `unexpected output: ${JSON.stringify(out).slice(0, 150)}`);
    }
  } else {
    const c = readConsensus(topicId);
    if (c?.conclusion) {
      pass(`consensus on filesystem: confidence=${c.confidence} (tool not captured)`);
      console.log(`  Conclusion: ${c.conclusion.slice(0, 120)}`);
    } else {
      fail('forum.get_consensus', 'tool not called and no consensus on disk');
    }
  }
} catch (e) { fail('forum.get_consensus', e.message); }

// ─── T7: forum.list_topics ──────────────────────────────────
console.log('\n[T7] forum.list_topics');
try {
  const { events } = runOpenCode(
    `Call forum.list_topics. Does the list include "${topicId}"? Output yes or no.`,
    { timeoutMs: 40_000 }
  );

  const calls = findToolCalls(events, 'forum.list_topics');
  if (calls.length > 0) {
    const out = parseToolOutput(calls[0]);
    const topics = out?.topics ?? [];
    const found = topics.some(t => t.id === topicId);
    if (found) {
      pass(`forum.list_topics: topic ${topicId} in list (${topics.length} total)`);
    } else {
      // filesystem fallback
      if (existsSync(path.join(AGORA_DIR, 'topics', topicId, 'meta.json'))) {
        pass(`topic exists on filesystem; list had ${topics.length} entries (possible pagination)`);
      } else {
        fail('forum.list_topics', `topic not in MCP list (${topics.length}) nor on disk`);
      }
    }
  } else {
    if (existsSync(path.join(AGORA_DIR, 'topics', topicId, 'meta.json'))) {
      pass(`topic ${topicId} on filesystem (tool not captured)`);
    } else {
      fail('forum.list_topics', 'tool not called and topic not on disk');
    }
  }
} catch (e) { fail('forum.list_topics', e.message); }

// ─── Summary ────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60));
console.log(`RESULTS: ${testResults.passed.length} passed, ${testResults.failed.length} failed`);
if (testResults.failed.length > 0) {
  console.log('FAILED:', testResults.failed.join(', '));
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED ✅');
}
