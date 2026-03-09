#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { BlackboardStore } from './dist/blackboard/store.js';
import { loadOpenCodeConfig, resolveProviders } from './dist/config/opencode-loader.js';

const topicId = process.argv[2] || 'topic_20260309_cdcbdb';

// ANSI 颜色代码
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

// Braille spinner
const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinnerIdx = 0;

function getStatusColor(status) {
  switch (status) {
    case 'running': return colors.green;
    case 'paused': return colors.yellow;
    case 'completed': return colors.green;
    case 'failed': return colors.red;
    default: return colors.white;
  }
}

function getAgentIcon(status) {
  if (status === 'thinking') return colors.cyan + spinner[spinnerIdx] + colors.reset;
  if (status === 'posted') return colors.green + '●' + colors.reset;
  if (status === 'error') return colors.red + '✗' + colors.reset;
  return colors.dim + '○' + colors.reset;
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.substring(0, len - 3) + '...' : str;
}

async function render() {
  const store = new BlackboardStore('.agora');
  await store.init();
  
  const status = await store.getLiveStatus(topicId);
  
  if (!status) {
    console.log(`${colors.red}Topic not found: ${topicId}${colors.reset}`);
    return;
  }
  
  // Update spinner
  spinnerIdx = (spinnerIdx + 1) % spinner.length;
  
  console.clear();
  
  // Header with Cyber-Renaissance style
  console.log(`${colors.cyan}╔══════════════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}║${colors.reset} ${colors.bright}AGORA DEBATE${colors.reset}                                                        ${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}║${colors.reset} ${truncate(status.topic_id, 66).padEnd(66)} ${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}╚══════════════════════════════════════════════════════════════════════╝${colors.reset}`);
  console.log();
  
  // Status bar with animation
  const statusColor = getStatusColor(status.status);
  console.log(`${statusColor}${colors.bright} ${status.status === 'running' ? spinner[spinnerIdx] : '●'} ${status.status.toUpperCase()}${colors.reset}  ` +
              `${colors.white}Round ${status.current_round}/${status.total_rounds}${colors.reset}  ` +
              `${colors.yellow}💡 ${status.pending_guidance} pending${colors.reset}`);
  console.log();
  
  // Agent Pool with animated status
  console.log(`${colors.bright}👥 AGENT POOL${colors.reset}`);
  console.log(`${colors.dim}${'─'.repeat(70)}${colors.reset}`);
  status.agents.forEach(agent => {
    const icon = getAgentIcon(agent.status);
    console.log(`  ${icon}  ${agent.role.padEnd(12)} ${colors.dim}${truncate(agent.model, 30)}${colors.reset}`);
  });
  console.log();
  
  // Live Feed with message bubbles
  console.log(`${colors.bright}💬 THE FORUM${colors.reset}`);
  console.log(`${colors.dim}${'─'.repeat(70)}${colors.reset}`);
  
  const recentPosts = status.recent_posts.slice(-5);
  recentPosts.forEach((post, idx) => {
    const isNew = idx === recentPosts.length - 1;
    const prefix = isNew ? colors.cyan + '▶ ' + colors.reset : '  ';
    
    // Role color coding
    let roleColor = colors.white;
    if (post.role.includes('远程') || post.role.includes('乐观')) roleColor = colors.green;
    else if (post.role.includes('办公室') || post.role.includes('悲观')) roleColor = colors.red;
    else if (post.role.includes('混合') || post.role.includes('中立')) roleColor = colors.yellow;
    
    console.log(`${prefix}${colors.dim}[Round ${post.round}]${colors.reset} ${roleColor}${post.role}${colors.reset}`);
    console.log(`     ${truncate(post.position, 65)}`);
    
    if (post.reasoning && post.reasoning[0]) {
      console.log(`     ${colors.dim}→ ${truncate(post.reasoning[0], 60)}${colors.reset}`);
    }
    console.log();
  });
  
  // Blackboard
  if (status.blackboard.length > 0) {
    console.log(`${colors.bright}📌 SYNTAGMA (Blackboard)${colors.reset}`);
    console.log(`${colors.dim}${'─'.repeat(70)}${colors.reset}`);
    status.blackboard.forEach(item => {
      let typeColor = colors.white;
      let icon = '▪';
      if (item.type === 'consensus') { typeColor = colors.green; icon = '✓'; }
      else if (item.type === 'checkpoint') { typeColor = colors.blue; icon = '◆'; }
      else if (item.type === 'note') { typeColor = colors.yellow; icon = '◈'; }
      else if (item.type === 'guidance') { typeColor = colors.magenta; icon = '⚡'; }
      
      console.log(`  ${typeColor}${icon} [${item.type.toUpperCase()}]${colors.reset}`);
      console.log(`     ${truncate(item.content, 60)}`);
    });
    console.log();
  }
  
  console.log(`${colors.dim}${'─'.repeat(70)}${colors.reset}`);
  console.log(`${colors.dim}Controls: Ctrl+C to exit | Auto-refresh every 1s${colors.reset}`);
  console.log(`${colors.dim}Last update: ${new Date().toLocaleTimeString()}${colors.reset}`);
}

// Initial render
await render();

// Auto refresh
const interval = setInterval(render, 1000);

// Exit handlers
process.on('SIGINT', () => {
  clearInterval(interval);
  console.clear();
  console.log(`${colors.green}👋 Goodbye!${colors.reset}`);
  process.exit(0);
});

process.on('SIGTERM', () => {
  clearInterval(interval);
  process.exit(0);
});
