import path from 'node:path';
import { BlackboardStore } from './dist/blackboard/store.js';
import { DebateController } from './dist/moderator/controller.js';
import { ConsensusSynthesizer } from './dist/consensus/synthesizer.js';
import { OpenCodeHttpClient } from './dist/agents/opencode-http-client.js';

const agoraDir = path.join(process.cwd(), '.agora');
const url = await OpenCodeHttpClient.discoverUrl();
console.log('[1] OpenCode URL:', url);

const store = new BlackboardStore(agoraDir);
await store.init();

const topicId = `topic_e2e_${Date.now()}`;
const question = '单元测试值得写吗？';
const agents = [
  { role: 'tdd_fan',    model: 'local/Qwen/Qwen3.5-27B-FP8', persona: '热爱TDD，认为测试是工程质量的基石' },
  { role: 'pragmatist', model: 'local/Qwen/Qwen3.5-27B-FP8', persona: '务实派，认为测试要看ROI' },
];

const controller = new DebateController({
  store,
  opencodeUrl: url,
  directory: process.cwd(),
  retryOpts: { maxAttempts: 2, baseDelayMs: 500 },
  timeoutMs: 120_000,
  onProgress: (ev) => {
    const t = new Date().toLocaleTimeString();
    if (['round_started','agent_thinking','agent_posted','vote_cast','debate_complete','error'].includes(ev.type)) {
      const extra =
        ev.type === 'agent_posted'  ? ` → "${ev.post.position.slice(0, 50)}..."` :
        ev.type === 'agent_thinking' ? ` (${ev.agent})` :
        ev.type === 'vote_cast'      ? ` ${ev.vote.role} → ${ev.vote.chosen_position}` :
        ev.type === 'error'          ? ` ❌ ${ev.message}` : '';
      console.log(`[${t}] ${ev.type}${extra}`);
    }
  },
});

console.log('[2] Running debate:', topicId);
try {
  await controller.runDebate({ topicId, question, agents });
  console.log('[3] Debate done. Synthesizing consensus...');

  const votes    = await store.getVotes(topicId);
  const allPosts = await Promise.all([1, 2, 3].map(r => store.getRoundPosts(topicId, r)));

  const synth = new ConsensusSynthesizer({
    opencodeUrl: url,
    directory: process.cwd(),
    moderatorModel: 'local/Qwen/Qwen3.5-27B-FP8',
  });

  const consensus = await synth.synthesize({ topicId, question, votes, allPosts, roundsTaken: 3 });
  await store.saveConsensus(topicId, consensus);

  console.log('\n=== CONSENSUS ===');
  console.log('Conclusion:', consensus.conclusion);
  console.log('Confidence:', consensus.confidence);
  console.log('Vote dist:', JSON.stringify(consensus.vote_distribution));
  console.log('[4] SUCCESS ✅');
} catch (err) {
  console.error('[ERROR]', err.message);
  console.error(err.stack);
}
