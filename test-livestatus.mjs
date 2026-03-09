import { BlackboardStore } from './dist/blackboard/store.js';

async function test() {
  const store = new BlackboardStore('.agora');
  await store.init();
  
  const topicId = 'topic_20260309_e2c0b5';
  console.log('Testing getLiveStatus for:', topicId);
  
  try {
    const status = await store.getLiveStatus(topicId);
    console.log('Result:', JSON.stringify(status, null, 2));
  } catch (err) {
    console.error('Error:', err);
  }
}

test();
