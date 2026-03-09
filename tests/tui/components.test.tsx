import React from 'react';
import { render } from 'ink-testing-library';
import { Header } from '../../src/tui/components/Header';
import { AgentPanel } from '../../src/tui/components/AgentPanel';
import { StatusBar } from '../../src/tui/components/StatusBar';
import { PostFeed, Post } from '../../src/tui/components/PostFeed';
import { BlackboardPanel, BlackboardItem } from '../../src/tui/components/BlackboardPanel';

describe('TUI Components', () => {
  describe('Header', () => {
    it('renders truncated question and running status', () => {
      const { lastFrame } = render(
        <Header 
          question="This is a very long question that should definitely be truncated because it exceeds fifty characters easily."
          status="running"
          topicId="T-123"
          round={1}
          totalRounds={5}
        />
      );
      const frame = lastFrame() || '';
      expect(frame).toContain('RUNNING');
      expect(frame).toContain('Round 1/5');
      expect(frame).toContain('This is a very long question that should defini...');
    });
  });

  describe('AgentPanel', () => {
    it('renders agents with status indicators', () => {
      const agents = [
        { id: '1', role: 'Researcher', model: 'gpt-4', status: 'thinking' as const },
        { id: '2', role: 'Writer', model: 'claude-3', status: 'waiting' as const }
      ];
      const { lastFrame } = render(<AgentPanel agents={agents} />);
      const frame = lastFrame() || '';
      expect(frame).toContain('Researcher');
      expect(frame).toContain('Writer');
      expect(frame).toContain('gpt-4');
      expect(frame).toContain('◐');
      expect(frame).toContain('●');
    });
  });

  describe('StatusBar', () => {
    it('renders progress and key hints', () => {
      const { lastFrame } = render(
        <StatusBar round={2} totalRounds={5} paused={false} pendingGuidance={3} />
      );
      const frame = lastFrame() || '';
      expect(frame).toContain('Progress: Round 2/5');
      expect(frame).toContain('3 GUIDANCE');
      expect(frame).toContain('[p]ause');
      expect(frame).toContain('[q]uit');
    });
  });

  describe('PostFeed', () => {
    it('renders an empty state when no posts are provided', () => {
      const { lastFrame } = render(<PostFeed posts={[]} />);
      const frame = lastFrame() || '';
      expect(frame).toContain('POST FEED');
      expect(frame).toContain('No posts yet...');
    });

    it('renders a list of posts with truncation', () => {
      const posts: Post[] = [
        { id: '1', round: 1, role: 'user', content: 'Hello assistant!' },
        { id: '2', round: 2, role: 'assistant', content: 'A'.repeat(100) },
      ];
      const { lastFrame } = render(<PostFeed posts={posts} />);
      const frame = lastFrame() || '';
      
      expect(frame).toContain('[Round 1]');
      expect(frame).toContain('user:');
      expect(frame).toContain('Hello assistant!');
      
      expect(frame).toContain('[Round 2]');
      expect(frame).toContain('assistant:');
      const strippedFrame = frame.replace(/[^A-Za-z0-9.]/g, '');
      expect(strippedFrame).toContain('A'.repeat(80) + '...');
    });

    it('respects maxVisible prop', () => {
      const posts: Post[] = Array.from({ length: 15 }, (_, i) => ({
        id: String(i),
        round: i,
        role: 'system',
        content: `Message ${i}`,
      }));
      
      // Default maxVisible is 10, so round 4 should be missing, but round 14 should be there
      const { lastFrame } = render(<PostFeed posts={posts} />);
      const frame = lastFrame() || '';
      expect(frame).not.toContain('[Round 4]');
      expect(frame).toContain('[Round 14]');
    });
  });

  describe('BlackboardPanel', () => {
    it('renders an empty state when no items are provided', () => {
      const { lastFrame } = render(<BlackboardPanel items={[]} />);
      const frame = lastFrame() || '';
      expect(frame).toContain('BLACKBOARD');
      expect(frame).toContain('No items pinned...');
    });

    it('renders a list of items with appropriate formatting', () => {
      const items: BlackboardItem[] = [
        { id: '1', type: 'consensus', content: 'We agree on X' },
        { id: '2', type: 'note', content: 'Remember Y' },
      ];
      const { lastFrame } = render(<BlackboardPanel items={items} />);
      const frame = lastFrame() || '';
      
      expect(frame).toContain('[CONSENSUS]');
      expect(frame).toContain('We agree on X');
      expect(frame).toContain('[NOTE]');
      expect(frame).toContain('Remember Y');
    });

    it('respects maxItems prop', () => {
      const items: BlackboardItem[] = Array.from({ length: 10 }, (_, i) => ({
        id: String(i),
        type: 'guidance',
        content: `Item ${i}`,
      }));
      
      // maxItems=5, so item 4 should be missing, item 9 should be present
      const { lastFrame } = render(<BlackboardPanel items={items} maxItems={5} />);
      const frame = lastFrame() || '';
      
      expect(frame).not.toContain('Item 4');
      expect(frame).toContain('Item 9');
    });
  });
});
