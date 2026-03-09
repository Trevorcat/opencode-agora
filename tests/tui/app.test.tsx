import React from 'react';
import { render } from 'ink-testing-library';
import { App } from '../../src/tui/App.js';
import type { BlackboardStore } from '../../src/blackboard/store.js';
import type { DebateController } from '../../src/moderator/controller.js';
import type { LiveStatus } from '../../src/blackboard/types.js';
import { describe, it, expect, vi } from 'vitest';

// Mock LiveStatus for tests
const mockLiveStatus: LiveStatus = {
  topic_id: 'test-topic',
  status: 'running',
  current_round: 1,
  total_rounds: 3,
  agents: [
    { role: 'researcher', model: 'gpt-4', status: 'waiting' },
  ],
  recent_posts: [],
  blackboard: [],
  pending_guidance: 0,
};

describe('TUI App', () => {
  it('renders loading state initially', () => {
    const store = {
      getLiveStatus: vi.fn().mockResolvedValue(mockLiveStatus),
      onProgress: vi.fn().mockReturnValue(() => {}),
    } as unknown as BlackboardStore;
    
    const controller = {
      pauseDebate: vi.fn(),
      resumeDebate: vi.fn(),
      injectGuidance: vi.fn(),
    } as unknown as DebateController;
    
    const { lastFrame } = render(<App topicId="cyber-ethics" store={store} controller={controller} />);
    
    const frame = lastFrame();
    expect(frame).toContain('Loading debate data');
    expect(frame).toContain('cyber-ethics');
  });

  it.skip('enters guidance mode on "g"', async () => {
    // Note: This test requires full stdin mock with ref() method
    // Skipped due to ink-testing-library limitations
  });

  it.skip('pauses and resumes debate on "p" and "r"', async () => {
    // Note: This test requires full stdin mock with ref() method
    // Skipped due to ink-testing-library limitations
  });
});
