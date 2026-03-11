import { BlackboardStore } from './dist/blackboard/store.js';
import { DebateController } from './dist/moderator/controller.js';
import { OpenCodeHttpClient } from './dist/agents/opencode-http-client.js';

async function testTUI() {
  const store = new BlackboardStore('.agora');
  await store.init();

  const opencodeUrl = await OpenCodeHttpClient.discoverUrl();

  const controller = new DebateController({
    store,
    opencodeUrl,
    directory: process.cwd(),
    retryOpts: { maxAttempts: 3, baseDelayMs: 1000 },
    timeoutMs: 60000,
  });
  
  const topicId = 'topic_20260309_e2c0b5';
  console.log('Testing TUI data flow for:', topicId);
  
  try {
    const status = await store.getLiveStatus(topicId);
    if (!status) {
      console.log('No status returned (topic not found)');
      return;
    }
    
    console.log('\n=== Agent Pool ===');
    status.agents.forEach(agent => {
      console.log(`- ${agent.role} (${agent.model}): ${agent.status}`);
    });
    
    console.log('\n=== Recent Posts ===');
    status.recent_posts.slice(-3).forEach(post => {
      console.log(`[Round ${post.round}] ${post.role}: ${post.position.substring(0, 50)}...`);
    });
    
    console.log('\n=== Blackboard ===');
    if (status.blackboard.length === 0) {
      console.log('(empty)');
    } else {
      status.blackboard.forEach(item => {
        console.log(`[${item.type}] ${item.content.substring(0, 50)}`);
      });
    }
    
    console.log('\n=== Status ===');
    console.log(`Status: ${status.status}`);
    console.log(`Round: ${status.current_round}/${status.total_rounds}`);
    console.log(`Pending Guidance: ${status.pending_guidance}`);
    
  } catch (err) {
    console.error('Error:', err);
  }
}

testTUI();
