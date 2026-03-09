#!/usr/bin/env node
/**
 * Mouse Support Demo using ink-mouse
 * 
 * NOTE: Requires terminal with mouse support (Windows Terminal, iTerm2, etc.)
 * Limitations: 
 * - May conflict with some terminal multiplexers (tmux, screen)
 * - Windows Terminal support is partial
 * - Must enable "raw mode" which can cause other issues
 */

import React, { useState, useEffect } from 'react';
import { render, Box, Text, useApp } from 'ink';
import { useMouse, MouseProvider } from '@ink-tools/ink-mouse';
import { BlackboardStore } from './dist/blackboard/store.js';

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

interface MouseMonitorProps {
  topicId: string;
  store: BlackboardStore;
}

const MouseMonitor: React.FC<MouseMonitorProps> = ({ topicId, store }) => {
  const { exit } = useApp();
  const [data, setData] = useState<any>(null);
  const [hoveredPost, setHoveredPost] = useState<number | null>(null);
  const [selectedPost, setSelectedPost] = useState<number | null>(null);
  const [spinnerIdx, setSpinnerIdx] = useState(0);
  
  // Mouse position tracking
  const mouse = useMouse();

  // Animation
  useEffect(() => {
    const anim = setInterval(() => {
      setSpinnerIdx(i => (i + 1) % SPINNER.length);
    }, 80);
    return () => clearInterval(anim);
  }, []);

  // Data polling
  useEffect(() => {
    const poll = async () => {
      try {
        const status = await store.getLiveStatus(topicId);
        setData(status);
      } catch (err) {
        console.error('Poll error:', err);
      }
    };

    poll();
    const interval = setInterval(poll, 500);
    return () => clearInterval(interval);
  }, [store, topicId]);

  // Detect hover over posts (y-coordinates 5-15 approx)
  useEffect(() => {
    if (!mouse.isDown) {
      // Simple hover detection based on Y position
      const posts = data?.recent_posts?.slice(-6) || [];
      const relativeY = mouse.y - 5; // Adjust based on header height
      
      if (relativeY >= 0 && relativeY < posts.length * 3) {
        const postIndex = Math.floor(relativeY / 3);
        setHoveredPost(postIndex);
      } else {
        setHoveredPost(null);
      }
    }
  }, [mouse.y, mouse.isDown, data]);

  // Click to select
  useEffect(() => {
    if (mouse.isDown && hoveredPost !== null) {
      setSelectedPost(hoveredPost);
    }
  }, [mouse.isDown, hoveredPost]);

  // Keyboard backup
  useEffect(() => {
    const handleKey = (data: Buffer) => {
      const key = data.toString();
      if (key === 'q' || key === '\u0003') { // q or Ctrl+C
        exit();
      }
      if (key === '\u001b' && selectedPost !== null) {
        setSelectedPost(null);
      }
    };

    process.stdin.on('data', handleKey);
    return () => {
      process.stdin.off('data', handleKey);
    };
  }, [exit, selectedPost]);

  if (!data) {
    return (
      <Box padding={2}>
        <Text color="cyan">{SPINNER[spinnerIdx]} Loading...</Text>
      </Box>
    );
  }

  // Detail view
  if (selectedPost !== null && data.recent_posts[selectedPost]) {
    const post = data.recent_posts[selectedPost];
    return (
      <Box flexDirection="column" height="100%" padding={1} borderStyle="double" borderColor="cyan">
        <Text bold color="cyan">Post Detail (Click or Esc to close)</Text>
        <Box marginY={1}>
          <Text bold>[{post.role}]</Text>
          <Text color="gray"> Round {post.round}</Text>
        </Box>
        <Box borderStyle="single" padding={1}>
          <Text>{post.position}</Text>
        </Box>
        {post.reasoning?.map((r: string, i: number) => (
          <Box key={i} paddingLeft={2} marginTop={1}>
            <Text>- {r.substring(0, 80)}</Text>
          </Box>
        ))}
        <Box marginTop={2}>
          <Text dimColor>Mouse: click elsewhere | Keyboard: Esc to close</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height="100%">
      {/* Header */}
      <Box height={3} borderStyle="double" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">AGORA (Mouse Enabled)</Text>
        <Text color="gray"> Click posts to expand | Scroll with mouse wheel</Text>
      </Box>

      {/* Mouse debug info */}
      <Box height={1}>
        <Text dimColor>Mouse: ({mouse.x}, {mouse.y}) {mouse.isDown ? '● clicking' : ''}</Text>
      </Box>

      {/* Main */}
      <Box flexGrow={1} flexDirection="row">
        <Box width="30%" borderStyle="bold" borderColor="cyan" paddingX={1}>
          <Text bold>AGENTS</Text>
          {data.agents.map((agent: any, i: number) => (
            <Box key={i}>
              <Text>{agent.status === 'thinking' ? SPINNER[(spinnerIdx + i) % SPINNER.length] : '●'}</Text>
              <Text> {agent.role}</Text>
            </Box>
          ))}
        </Box>

        <Box width="70%" borderStyle="round" borderColor="white" paddingX={1}>
          <Text bold>THE FORUM (hover to highlight, click to expand)</Text>
          {data.recent_posts.slice(-6).map((post: any, idx: number) => {
            const isHovered = hoveredPost === idx;
            const isSelected = selectedPost === idx;
            return (
              <Box 
                key={idx}
                borderStyle={isSelected ? "double" : isHovered ? "bold" : "single"}
                borderColor={isSelected ? "green" : isHovered ? "yellow" : "white"}
                paddingX={1}
                marginY={1}
              >
                <Text bold={isHovered || isSelected}>[{post.role}]</Text>
                <Text> {post.position.substring(0, 50)}...</Text>
                {isHovered && <Text color="yellow"> 👈 hover</Text>}
                {isSelected && <Text color="green"> ✓ selected</Text>}
              </Box>
            );
          })}
        </Box>
      </Box>

      <Box height={2} borderStyle="classic" borderColor="green" paddingX={1}>
        <Text dimColor>q:quit | mouse:click/scroll | Esc:back</Text>
      </Box>
    </Box>
  );
};

// Wrap with MouseProvider
const topicId = process.argv[2] || 'topic_20260309_cdcbdb';
const store = new BlackboardStore('.agora');

render(
  <MouseProvider>
    <MouseMonitor topicId={topicId} store={store} />
  </MouseProvider>
);
