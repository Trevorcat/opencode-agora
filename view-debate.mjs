#!/usr/bin/env node
import { BlackboardStore } from './dist/blackboard/store.js';
import { loadOpenCodeConfig, resolveProviders } from './dist/config/opencode-loader.js';

const topicId = process.argv[2] || 'topic_20260309_e2c0b5';

async function main() {
  const store = new BlackboardStore('.agora');
  await store.init();
  
  const status = await store.getLiveStatus(topicId);
  
  if (!status) {
    console.log('Topic not found:', topicId);
    process.exit(1);
  }
  
  console.clear();
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log(`║  AGORA DEBATE: ${status.topic_id.substring(0, 40).padEnd(40)} ║`);
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log();
  
  console.log(`📊 Status: ${status.status.toUpperCase()} | Round ${status.current_round}/${status.total_rounds}`);
  console.log(`💡 Pending Guidance: ${status.pending_guidance}`);
  console.log();
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('👥 AGENT POOL');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  status.agents.forEach(agent => {
    const statusIcon = agent.status === 'posted' ? '✓' : agent.status === 'thinking' ? '◐' : '○';
    console.log(`  ${statusIcon} ${agent.role.padEnd(12)} | ${agent.model.substring(0, 30)}`);
  });
  console.log();
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💬 RECENT POSTS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  status.recent_posts.slice(-5).forEach((post, i) => {
    console.log(`\n[Round ${post.round}] ${post.role}:`);
    console.log(`  ${post.position.substring(0, 70)}${post.position.length > 70 ? '...' : ''}`);
    if (post.reasoning && post.reasoning[0]) {
      console.log(`  → ${post.reasoning[0].substring(0, 65)}${post.reasoning[0].length > 65 ? '...' : ''}`);
    }
  });
  console.log();
  
  if (status.blackboard.length > 0) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📌 BLACKBOARD');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    status.blackboard.forEach(item => {
      console.log(`\n[${item.type.toUpperCase()}]`);
      console.log(`  ${item.content.substring(0, 70)}`);
    });
  }
  
  console.log();
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Last updated:', new Date().toLocaleTimeString());
}

main().catch(console.error);
