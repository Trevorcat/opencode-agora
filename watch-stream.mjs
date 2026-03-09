#!/usr/bin/env node
import { BlackboardStore } from './dist/blackboard/store.js';
import { loadOpenCodeConfig, resolveProviders } from './dist/config/opencode-loader.js';

const topicId = process.argv[2] || 'topic_20260309_cdcbdb';

// Braille spinner for animation
const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinnerIdx = 0;

async function render() {
  const store = new BlackboardStore('.agora');
  await store.init();
  
  const status = await store.getLiveStatus(topicId);
  
  if (!status) {
    console.log('Topic not found:', topicId);
    return;
  }
  
  // Update spinner
  spinnerIdx = (spinnerIdx + 1) % spinner.length;
  
  console.clear();
  
  // Header
  console.log('\x1b[36m╔══════════════════════════════════════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[36m║\x1b[0m \x1b[1mAGORA DEBATE v2.0 - STREAMING\x1b[0m                                      \x1b[36m║\x1b[0m');
  console.log('\x1b[36m║\x1b[0m', topicId.substring(0, 66).padEnd(66), '\x1b[36m║\x1b[0m');
  console.log('\x1b[36m╚══════════════════════════════════════════════════════════════════════╝\x1b[0m');
  console.log();
  
  // Status
  const statusColor = status.status === 'running' ? '\x1b[32m' : 
                     status.status === 'paused' ? '\x1b[33m' : 
                     status.status === 'failed' ? '\x1b[31m' : '\x1b[32m';
  console.log(`${statusColor}\x1b[1m ${spinner[spinnerIdx]} ${status.status.toUpperCase()}\x1b[0m  Round ${status.current_round}/${status.total_rounds}  💡 ${status.pending_guidance} pending`);
  console.log();
  
  // Agents with animated thinking state
  console.log('\x1b[1m👥 AGENTS\x1b[0m');
  console.log('\x1b[2m' + '─'.repeat(70) + '\x1b[0m');
  status.agents.forEach((agent, i) => {
    const isThinking = agent.status === 'thinking';
    const icon = isThinking ? '\x1b[36m' + spinner[(spinnerIdx + i) % spinner.length] + '\x1b[0m' :
                agent.status === 'posted' ? '\x1b[32m●\x1b[0m' :
                '\x1b[2m○\x1b[0m';
    console.log(`  ${icon}  ${agent.role.padEnd(12)} ${agent.model.substring(0, 30)}`);
  });
  console.log();
  
  // Posts with bubbles
  console.log('\x1b[1m💬 THE FORUM\x1b[0m');
  console.log('\x1b[2m' + '─'.repeat(70) + '\x1b[0m');
  
  const recentPosts = status.recent_posts.slice(-5);
  recentPosts.forEach((post, idx) => {
    const isNew = idx === recentPosts.length - 1;
    const borderChar = isNew ? '═' : '─';
    
    let roleColor = '\x1b[37m';
    if (post.role.includes('远程') || post.role.includes('乐观')) roleColor = '\x1b[32m';
    else if (post.role.includes('办公室') || post.role.includes('悲观')) roleColor = '\x1b[31m';
    else if (post.role.includes('混合') || post.role.includes('中立')) roleColor = '\x1b[33m';
    
    // Top border
    console.log(`\x1b[2m╭${borderChar.repeat(68)}╮\x1b[0m`);
    
    // Header
    console.log(`\x1b[2m│\x1b[0m ${roleColor}\x1b[1m[${post.role.toUpperCase()}]\x1b[0m  Round ${post.round}`.padEnd(73) + '\x1b[2m│\x1b[0m');
    
    // Content
    const content = post.position.length > 60 ? post.position.substring(0, 57) + '...' : post.position;
    console.log(`\x1b[2m│\x1b[0m  ${content}`.padEnd(73) + '\x1b[2m│\x1b[0m');
    
    // Bottom border
    console.log(`\x1b[2m╰${borderChar.repeat(68)}╯\x1b[0m`);
    console.log();
  });
  
  // Blackboard
  if (status.blackboard.length > 0) {
    console.log('\x1b[1m📌 SYNTAGMA\x1b[0m');
    console.log('\x1b[2m' + '─'.repeat(70) + '\x1b[0m');
    status.blackboard.forEach(item => {
      const icon = item.type === 'consensus' ? '\x1b[32m✓\x1b[0m' :
                  item.type === 'checkpoint' ? '\x1b[34m◆\x1b[0m' :
                  item.type === 'note' ? '\x1b[33m◈\x1b[0m' : '\x1b[35m⚡\x1b[0m';
      console.log(`  ${icon} [${item.type.toUpperCase()}] ${item.content.substring(0, 50)}`);
    });
    console.log();
  }
  
  console.log('\x1b[2m' + '─'.repeat(70) + '\x1b[0m');
  console.log('\x1b[2mPress Ctrl+C to exit | Auto-refresh every 1s\x1b[0m');
}

// Initial render
await render();

// Auto refresh
const interval = setInterval(render, 1000);

// Exit handlers
process.on('SIGINT', () => {
  clearInterval(interval);
  console.clear();
  console.log('\x1b[32m👋 Goodbye!\x1b[0m');
  process.exit(0);
});
