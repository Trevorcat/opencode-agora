import React from 'react';
import { render } from 'ink-testing-library';
import { App, BlackboardStore, DebateController } from '../../src/tui/App.js';
import { describe, it, expect, vi } from 'vitest';

describe('TUI App', () => {
  it('renders normal mode initially and respects layout structure', () => {
    const store: BlackboardStore = {
      getState: () => ({}),
      subscribe: vi.fn(),
    };
    
    const controller: DebateController = {
      pause: vi.fn(),
      resume: vi.fn(),
      injectGuidance: vi.fn(),
      getStatus: vi.fn().mockReturnValue('Running'),
    };
    
    const { lastFrame } = render(<App topicId="cyber-ethics" store={store} controller={controller} />);
    
    const frame = lastFrame();
    expect(frame).toContain('AGORÁ // DEBATE VECTOR');
    expect(frame).toContain('CYBER-ETHICS');
    expect(frame).toContain('[P]ause');
    expect(frame).toContain('● LIVE');
    expect(frame).toContain('AGENT POOL');
  });

  it('enters guidance mode on "g"', () => {
    const store: BlackboardStore = {
      getState: () => ({}),
      subscribe: vi.fn(),
    };
    
    const controller: DebateController = {
      pause: vi.fn(),
      resume: vi.fn(),
      injectGuidance: vi.fn(),
      getStatus: vi.fn().mockReturnValue('Running'),
    };
    
    const { stdin, lastFrame } = render(<App topicId="test" store={store} controller={controller} />);
    
    stdin.write('g');
    
    const frame = lastFrame();
    expect(frame).toContain('⚡ INJECT GUIDANCE ➔');
  });

  it('pauses and resumes debate on "p" and "r"', () => {
    const store: BlackboardStore = {
      getState: () => ({}),
      subscribe: vi.fn(),
    };
    
    const controller: DebateController = {
      pause: vi.fn(),
      resume: vi.fn(),
      injectGuidance: vi.fn(),
      getStatus: vi.fn().mockReturnValue('Paused'),
    };
    
    const { stdin, lastFrame } = render(<App topicId="test" store={store} controller={controller} />);
    
    // Simulate pressing "p"
    stdin.write('p');
    
    expect(controller.pause).toHaveBeenCalled();
    // After pause, status should render correctly based on getStatus mock
    const frame = lastFrame();
    expect(frame).toContain('■ PAUSED');
    
    // Simulate pressing "r"
    stdin.write('r');
    expect(controller.resume).toHaveBeenCalled();
  });
});
