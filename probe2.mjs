import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const MODEL = 'local/Qwen/Qwen3.5-27B-FP8';
const agents = [
  { role: 'proponent', model: MODEL, persona: 'Advocate for writing unit tests, ROI-focused' },
  { role: 'skeptic',   model: MODEL, persona: 'Challenges whether small projects need tests' },
];

const message = `Call forum.start_debate_async with: question="Is unit testing worth it for small projects?", agents=${JSON.stringify(agents)}
Output only the topicId from the response.`;

console.log('Message:', message.slice(0, 200));
console.log('Running opencode run...');

const result = spawnSync(
  'opencode',
  ['run', '--format', 'json', '--model', MODEL, '--dir', 'E:\\projects\\opencode-agora', message],
  { encoding: 'utf8', timeout: 60_000, cwd: 'E:\\projects\\opencode-agora', env: { ...process.env }, shell: true }
);

console.log('Exit code:', result.status);
console.log('Error:', result.error?.message ?? 'none');

const events = [];
for (const line of (result.stdout ?? '').split('\n')) {
  const t = line.trim();
  if (!t) continue;
  try { events.push(JSON.parse(t)); } catch {}
}

console.log('\nTotal events:', events.length);
for (const ev of events) {
  if (ev.type === 'tool_use') {
    console.log(`\n>>> TOOL CALL: ${ev.part?.tool}`);
    console.log('    input:', JSON.stringify(ev.part?.state?.input).slice(0, 300));
    console.log('    output:', (ev.part?.state?.output ?? '').slice(0, 300));
  } else if (ev.type === 'text' && ev.part?.text) {
    console.log(`TEXT: ${ev.part.text.slice(0, 200)}`);
  }
}

writeFileSync('E:\\projects\\opencode-agora\\probe2-stdout.json', JSON.stringify(events, null, 2));
console.log('\nFull events saved to probe2-stdout.json');
