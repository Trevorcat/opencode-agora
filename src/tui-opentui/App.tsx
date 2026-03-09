import React, { useState, useEffect } from 'react';
// @ts-ignore OpenTUI uses different module resolution
import { createCliRenderer } from '@opentui/core';
// @ts-ignore OpenTUI uses different module resolution
import { createRoot, useKeyboard, useTerminalDimensions } from '@opentui/react';
import type { BlackboardStore } from '../blackboard/store.js';
import type { DebateController } from '../moderator/controller.js';
import type { LiveStatus } from '../blackboard/types.js';

// Components
import { Header } from './components/Header.js';
import { AgentPanel } from './components/AgentPanel.js';
import { PostFeed } from './components/PostFeed.js';
import { BlackboardPanel } from './components/BlackboardPanel.js';
import { StatusBar } from './components/StatusBar.js';
import { GuidanceInput } from './components/GuidanceInput.js';

export type AppProps = {
  topicId: string;
  store: BlackboardStore;
  controller: DebateController;
};

export const App: React.FC<AppProps> = ({ topicId, store, controller }) => {
  const [inputMode, setInputMode] = useState<'normal' | 'guidance'>('normal');
  const [guidanceText, setGuidanceText] = useState('');
  const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [selectedPostIndex, setSelectedPostIndex] = useState(0);
  
  const { width, height } = useTerminalDimensions();

  // Poll for live status
  useEffect(() => {
    const poll = async () => {
      try {
        const status = await store.getLiveStatus(topicId);
        setLiveStatus(status);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };

    poll();
    const interval = setInterval(poll, 500);
    return () => clearInterval(interval);
  }, [store, topicId]);

  // Keyboard handling
  useKeyboard((key: { name: string; ctrl?: boolean }) => {
    if (inputMode === 'guidance') {
      if (key.name === 'escape') {
        setInputMode('normal');
        setGuidanceText('');
      } else if (key.name === 'return') {
        handleGuidanceSubmit(guidanceText);
      }
      return;
    }

    // Normal mode
    if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
      process.exit(0);
    } else if (key.name === 'p') {
      controller.pauseDebate(topicId).catch(console.error);
    } else if (key.name === 'r') {
      controller.resumeDebate(topicId).catch(console.error);
    } else if (key.name === 'g') {
      setInputMode('guidance');
    } else if (key.name === 'up') {
      setSelectedPostIndex(prev => Math.max(0, prev - 1));
    } else if (key.name === 'down') {
      const maxPosts = liveStatus?.recent_posts.length || 0;
      setSelectedPostIndex(prev => Math.min(maxPosts - 1, prev + 1));
    } else if (key.name === 'return' || key.name === 'space') {
      // Expand/collapse selected post
      if (liveStatus?.recent_posts[selectedPostIndex]) {
        const post = liveStatus.recent_posts[selectedPostIndex];
        const postId = `${post.role}-${selectedPostIndex}`;
        setExpandedPostId(expandedPostId === postId ? null : postId);
      }
    }
  });

  const handleGuidanceSubmit = async (value: string) => {
    if (value.trim()) {
      try {
        await controller.injectGuidance(topicId, value, {
          pinToBlackboard: false,
        });
      } catch (err) {
        console.error('Failed to inject guidance:', err);
      }
    }
    setGuidanceText('');
    setInputMode('normal');
  };

  if (error) {
    return (
      <box style={{ flexDirection: 'column', padding: 2 }}>
        <text style={{ color: '#ff6c6b', bold: true }}>Error loading debate status:</text>
        <text style={{ color: '#ff6c6b' }}>{error}</text>
        <text style={{ color: '#565f89' }}>Press 'q' to quit</text>
      </box>
    );
  }

  if (!liveStatus) {
    return (
      <box style={{ flexDirection: 'column', padding: 2, justifyContent: 'center', alignItems: 'center' }}>
        <text style={{ color: '#7aa2f7' }}>Loading debate data...</text>
        <text style={{ color: '#565f89' }}>Topic: {topicId}</text>
      </box>
    );
  }

  // Calculate layout dimensions
  const headerHeight = 3;
  const footerHeight = inputMode === 'guidance' ? 5 : 3;
  const contentHeight = height - headerHeight - footerHeight;
  const leftWidth = Math.floor(width * 0.20);
  const centerWidth = Math.floor(width * 0.50);
  const rightWidth = width - leftWidth - centerWidth;

  return (
    <box style={{ width: '100%', height: '100%', flexDirection: 'column' }}>
      {/* Header */}
      <box style={{ height: headerHeight }}>
        <Header
          question={liveStatus.topic_id}
          status={liveStatus.status === 'paused' ? 'paused' : liveStatus.status === 'completed' ? 'completed' : 'running'}
          topicId={topicId}
          round={liveStatus.current_round}
          totalRounds={liveStatus.total_rounds}
        />
      </box>

      {/* Main content */}
      <box style={{ flexDirection: 'row', height: contentHeight }}>
        {/* Left panel - Agents */}
        <box style={{ width: leftWidth, height: '100%' }}>
          <AgentPanel agents={liveStatus.agents} />
        </box>

        {/* Center panel - Posts */}
        <box style={{ width: centerWidth, height: '100%' }}>
          <PostFeed
            posts={liveStatus.recent_posts}
            selectedIndex={selectedPostIndex}
            expandedPostId={expandedPostId}
          />
        </box>

        {/* Right panel - Blackboard */}
        <box style={{ width: rightWidth, height: '100%' }}>
          <BlackboardPanel items={liveStatus.blackboard} />
        </box>
      </box>

      {/* Footer */}
      <box style={{ height: footerHeight }}>
        {inputMode === 'guidance' ? (
          <GuidanceInput
            value={guidanceText}
            onChange={setGuidanceText}
            onSubmit={handleGuidanceSubmit}
            onCancel={() => setInputMode('normal')}
          />
        ) : (
          <StatusBar
            round={liveStatus.current_round}
            totalRounds={liveStatus.total_rounds}
            paused={liveStatus.status === 'paused'}
            pendingGuidance={liveStatus.pending_guidance}
          />
        )}
      </box>
    </box>
  );
};

export async function runTUI(topicId: string, store: BlackboardStore, controller: DebateController) {
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
  });

  createRoot(renderer).render(<App topicId={topicId} store={store} controller={controller} />);
}
