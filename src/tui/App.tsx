import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, useInput, useApp, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import { Layout } from './components/Layout.js';
import { AgentPanel } from './components/AgentPanel.js';
import { PostFeed } from './components/PostFeed.js';
import { BlackboardPanel } from './components/BlackboardPanel.js';
import { Header } from './components/Header.js';
import { StatusBar } from './components/StatusBar.js';
import { BlackboardStore } from '../blackboard/store.js';
import { DebateController } from '../moderator/controller.js';
import type { LiveStatus, BlackboardItem } from '../blackboard/types.js';
import { useMouse, isInBox, type MouseEvent, type MousePosition } from './hooks/useMouse.js';

export type AppProps = {
  topicId: string;
  store: BlackboardStore;
  controller: DebateController;
};

export const App: React.FC<AppProps> = ({ topicId, store, controller }) => {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [inputMode, setInputMode] = useState<'normal' | 'guidance'>('normal');
  const [guidanceText, setGuidanceText] = useState('');
  const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<MousePosition>({ x: 0, y: 0 });
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [postScrollOffset, setPostScrollOffset] = useState(0);
  const [blackboardScrollOffset, setBlackboardScrollOffset] = useState(0);
  const [selectedPostIndex, setSelectedPostIndex] = useState(0);
  
  // Refs for tracking regions
  const layoutRef = useRef({
    header: { x: 0, y: 0, width: 0, height: 3 },
    leftPanel: { x: 0, y: 3, width: 0, height: 0 },
    centerPanel: { x: 0, y: 3, width: 0, height: 0 },
    rightPanel: { x: 0, y: 3, width: 0, height: 0 },
    footer: { x: 0, y: 0, width: 0, height: 3 },
  });

  // Calculate terminal dimensions
  const terminalWidth = stdout.columns || 120;
  const terminalHeight = stdout.rows || 30;
  
  // Calculate panel positions (matching Layout.tsx: 20-50-30 split)
  const leftWidth = Math.floor(terminalWidth * 0.20);
  const centerWidth = Math.floor(terminalWidth * 0.50);
  const rightWidth = terminalWidth - leftWidth - centerWidth;
  const headerHeight = 3;
  const footerHeight = 3;
  const contentHeight = terminalHeight - headerHeight - footerHeight;
  
  // Update layout ref
  useEffect(() => {
    layoutRef.current = {
      header: { x: 0, y: 0, width: terminalWidth, height: headerHeight },
      leftPanel: { x: 0, y: headerHeight, width: leftWidth, height: contentHeight },
      centerPanel: { x: leftWidth, y: headerHeight, width: centerWidth, height: contentHeight },
      rightPanel: { x: leftWidth + centerWidth, y: headerHeight, width: rightWidth, height: contentHeight },
      footer: { x: 0, y: terminalHeight - footerHeight, width: terminalWidth, height: footerHeight },
    };
  }, [terminalWidth, terminalHeight, leftWidth, centerWidth, rightWidth, headerHeight, footerHeight, contentHeight]);

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

  // Mouse event handler
  const handleMouse = useCallback((event: MouseEvent) => {
    setMousePos(event.position);

    if (event.type === 'scroll') {
      // Scroll in center panel (posts)
      if (isInBox(event.position, layoutRef.current.centerPanel)) {
        const delta = event.scrollDelta || 0;
        setPostScrollOffset(prev => {
          const newOffset = prev + (delta > 0 ? 1 : -1);
          return Math.max(0, newOffset);
        });
      }
      // Scroll in right panel (blackboard)
      else if (isInBox(event.position, layoutRef.current.rightPanel)) {
        const delta = event.scrollDelta || 0;
        setBlackboardScrollOffset(prev => {
          const newOffset = prev + (delta > 0 ? 1 : -1);
          return Math.max(0, newOffset);
        });
      }
    }

    if (event.type === 'click' && event.button === 'left') {
      // Click on pause/resume button area in header
      if (isInBox(event.position, { 
        x: terminalWidth - 20, 
        y: 1, 
        width: 8, 
        height: 1 
      })) {
        if (liveStatus?.status === 'paused') {
          controller.resumeDebate(topicId).catch(console.error);
        } else {
          controller.pauseDebate(topicId).catch(console.error);
        }
      }

      // Click in center panel to select post
      if (isInBox(event.position, layoutRef.current.centerPanel) && liveStatus?.recent_posts) {
        const posts = liveStatus.recent_posts;
        const postHeight = 4; // Approximate height per post
        const relativeY = event.position.y - headerHeight;
        const clickedIndex = Math.floor(relativeY / postHeight) + postScrollOffset;
        
        if (clickedIndex >= 0 && clickedIndex < posts.length) {
          const post = posts[clickedIndex];
          const postId = `${post.role}-${clickedIndex}`;
          setSelectedPostIndex(clickedIndex);
          setExpandedPostId(expandedPostId === postId ? null : postId);
        }
      }

      // Click on guidance button in footer
      if (isInBox(event.position, { 
        x: terminalWidth - 40, 
        y: terminalHeight - 1, 
        width: 12, 
        height: 1 
      })) {
        setInputMode('guidance');
      }
    }
  }, [topicId, controller, liveStatus, terminalWidth, terminalHeight, expandedPostId, postScrollOffset]);

  useMouse(handleMouse);

  useInput((input, key) => {
    if (inputMode === 'normal') {
      if (input === 'q') {
        exit();
      } else if (input === 'p') {
        controller.pauseDebate(topicId).catch(console.error);
      } else if (input === 'r') {
        controller.resumeDebate(topicId).catch(console.error);
      } else if (input === 'g') {
        setInputMode('guidance');
      } else if (key.upArrow) {
        setSelectedPostIndex(prev => Math.max(0, prev - 1));
        setPostScrollOffset(prev => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        const maxPosts = liveStatus?.recent_posts.length || 0;
        setSelectedPostIndex(prev => Math.min(maxPosts - 1, prev + 1));
        setPostScrollOffset(prev => prev + 1);
      } else if (key.return) {
        // Expand/collapse selected post
        if (liveStatus?.recent_posts[selectedPostIndex]) {
          const post = liveStatus.recent_posts[selectedPostIndex];
          const postId = `${post.role}-${selectedPostIndex}`;
          setExpandedPostId(expandedPostId === postId ? null : postId);
        }
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

  const agents = liveStatus?.agents.map(agent => ({
    id: agent.role,
    role: agent.role,
    model: agent.model,
    status: agent.status,
  })) || [];

  const posts = liveStatus?.recent_posts.map((post, idx) => ({
    id: `${post.role}-${idx}`,
    round: post.round,
    role: post.role,
    content: `${post.position}. ${post.reasoning?.[0] || ''}`,
    expanded: expandedPostId === `${post.role}-${idx}`,
    selected: selectedPostIndex === idx,
  })) || [];

  const blackboardItems = liveStatus?.blackboard || [];

  if (error) {
    return (
      <Box flexDirection="column" padding={2}>
        <Text color="redBright" bold>Error loading debate status:</Text>
        <Text color="red">{error}</Text>
        <Text dimColor>Press 'q' to quit</Text>
      </Box>
    );
  }

  if (!liveStatus) {
    return (
      <Box flexDirection="column" padding={2} justifyContent="center" alignItems="center">
        <Text color="cyanBright">Loading debate data...</Text>
        <Text dimColor>Topic: {topicId}</Text>
      </Box>
    );
  }

  return (
    <Layout
      header={
        <Header
          question={liveStatus.topic_id}
          status={liveStatus.status === 'paused' ? 'paused' : liveStatus.status === 'completed' ? 'completed' : 'running'}
          topicId={topicId}
          round={liveStatus.current_round}
          totalRounds={liveStatus.total_rounds}
        />
      }
      leftPanel={
        <AgentPanel agents={agents} />
      }
      centerPanel={
        <PostFeed posts={posts} maxVisible={15} />
      }
      rightPanel={
        <BlackboardPanel items={blackboardItems} maxItems={8} />
      }
      footer={
        <StatusBar
          round={liveStatus.current_round}
          totalRounds={liveStatus.total_rounds}
          paused={liveStatus.status === 'paused'}
          pendingGuidance={liveStatus.pending_guidance}
          inputMode={inputMode}
          guidanceText={guidanceText}
          setGuidanceText={setGuidanceText}
          onGuidanceSubmit={handleGuidanceSubmit}
          onCancelGuidance={() => setInputMode('normal')}
        />
      }
    />
  );
};
