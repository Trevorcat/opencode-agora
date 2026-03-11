#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { BlackboardStore } from './dist/blackboard/store.js';


const topicId = process.argv[2] || 'topic_20260309_e2c0b5';

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
  
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
};

function getStatusColor(status) {
  switch (status) {
    case 'running': return colors.green;
    case 'paused': return colors.yellow;
    case 'completed': return colors.green;
    case 'failed': return colors.red;
    default: return colors.white;
  }
}

function getStatusIcon(status) {
  switch (status) {
    case 'running': return '●';
    case 'paused': return '⏸';
    case 'completed': return '✓';
    case 'failed': return '✗';
    default: return '○';
  }
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
  
  // 清屏并移动到顶部
  console.clear();
  
  // 标题栏
  console.log(`${colors.cyan}╔══════════════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}║${colors.reset} ${colors.bright}AGORA DEBATE${colors.reset}                                                        ${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}║${colors.reset} ${truncate(status.topic_id, 66).padEnd(66)} ${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}╚══════════════════════════════════════════════════════════════════════╝${colors.reset}`);
  console.log();
  
  // 状态栏
  const statusColor = getStatusColor(status.status);
  const statusIcon = getStatusIcon(status.status);
  console.log(`${statusColor}${colors.bright} ${statusIcon} ${status.status.toUpperCase()}${colors.reset}  ` +
              `${colors.white}Round ${status.current_round}/${status.total_rounds}${colors.reset}  ` +
              `${colors.yellow}💡 ${status.pending_guidance} pending${colors.reset}`);
  console.log();
  
  // Agent Pool
  console.log(`${colors.bright}👥 AGENTS${colors.reset}`);
  console.log(`${colors.dim}${'─'.repeat(70)}${colors.reset}`);
  status.agents.forEach(agent => {
    const icon = agent.status === 'posted' ? colors.green + '✓' : 
                 agent.status === 'thinking' ? colors.yellow + '◐' : 
                 agent.status === 'error' ? colors.red + '✗' : colors.dim + '○';
    const model = truncate(agent.model, 35);
    console.log(`  ${icon}${colors.reset} ${agent.role.padEnd(12)} ${colors.dim}${model}${colors.reset}`);
  });
  console.log();
  
  // Recent Posts（带滚动效果）
  console.log(`${colors.bright}💬 LIVE FEED${colors.reset}`);
  console.log(`${colors.dim}${'─'.repeat(70)}${colors.reset}`);
  
  const recentPosts = status.recent_posts.slice(-10); // 显示最近 10 条
  recentPosts.forEach((post, idx) => {
    const isNew = idx === recentPosts.length - 1;
    const prefix = isNew ? colors.green + '▶ ' : '  ';
    const roleColor = post.role.includes('乐观') ? colors.green :
                     post.role.includes('悲观') ? colors.red :
                     post.role.includes('中立') ? colors.yellow : colors.cyan;
    
    console.log(`${prefix}${colors.reset}${colors.dim}[Round ${post.round}]${colors.reset} ${roleColor}${post.role}${colors.reset}`);
    console.log(`     ${truncate(post.position, 65)}`);
    
    // 显示第一条 reasoning（如果存在）
    if (post.reasoning && post.reasoning[0]) {
      console.log(`     ${colors.dim}→ ${truncate(post.reasoning[0], 60)}${colors.reset}`);
    }
    console.log();
  });
  
  // Blackboard
  if (status.blackboard.length > 0) {
    console.log(`${colors.bright}📌 BLACKBOARD${colors.reset}`);
    console.log(`${colors.dim}${'─'.repeat(70)}${colors.reset}`);
    status.blackboard.forEach(item => {
      const typeColor = item.type === 'consensus' ? colors.green :
                       item.type === 'guidance' ? colors.yellow :
                       item.type === 'checkpoint' ? colors.blue : colors.magenta;
      console.log(`  ${typeColor}[${item.type.toUpperCase()}]${colors.reset}`);
      console.log(`     ${truncate(item.content, 65)}`);
    });
    console.log();
  }
  
  // 底部控制栏
  console.log(`${colors.dim}${'─'.repeat(70)}${colors.reset}`);
  console.log(`${colors.dim}Controls: Ctrl+C to exit | Auto-refresh every 1s${colors.reset}`);
  console.log(`${colors.dim}Last update: ${new Date().toLocaleTimeString()}${colors.reset}`);
}

// 初始渲染
await render();

// 自动刷新（每 1 秒）
const interval = setInterval(render, 1000);

// 优雅退出
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
