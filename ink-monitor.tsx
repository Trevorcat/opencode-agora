#!/usr/bin/env node
/**
 * Stable Stream Monitor - No flickering version
 * Uses incremental rendering instead of clear-screen
 */

import { spawn } from 'node:child_process';
import React, { useState, useEffect } from 'react';
import { render, Box, Text, useApp, useInput } from 'ink';
import { BlackboardStore } from './dist/blackboard/store.js';

// Braille spinner
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

interface MonitorProps {
  topicId: string;
  store: BlackboardStore;
}

const Monitor: React.FC<MonitorProps> = ({ topicId, store }) => {
  const { exit } = useApp();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [spinnerIdx, setSpinnerIdx] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);

  // Spinner animation (smooth, no flicker)
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
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };

    poll();
    const interval = setInterval(poll, 500);
    return () => clearInterval(interval);
  }, [store, topicId]);

  // Keyboard controls
  useInput((input, key) => {
    if (key.escape || input === 'q') {
      if (expanded !== null) {
        setExpanded(null);
      } else {
        exit();
      }
    }
    
    if (!expanded && input >= '1' && input <= '9') {
      const idx = parseInt(input) - 1;
      if (data?.recent_posts?.[idx]) {
        setExpanded(idx);
      }
    }
  });

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Error: {error}</Text>
        <Text dimColor>Press q to quit</Text>
      </Box>
    );
  }

  if (!data) {
    return (
      <Box flexDirection="column" padding={2}>
        <Text color="cyan">{SPINNER[spinnerIdx]} Loading debate data...</Text>
      </Box>
    );
  }

  // Expanded view
  if (expanded !== null && data.recent_posts[expanded]) {
    const post = data.recent_posts[expanded];
    return (
      <Box flexDirection="column" height="100%" padding={1} borderStyle="double" borderColor="cyan">
        <Box marginBottom={1}>
          <Text bold color="cyan">╭─ Full Post View ─╮</Text>
        </Box>
        <Box>
          <Text bold color="white">[{post.role.toUpperCase()}]</Text>
          <Text color="gray"> - Round {post.round}</Text>
        </Box>
        <Box marginY={1} borderStyle="single" padding={1}>
          <Text color="whiteBright">{post.position}</Text>
        </Box>
        {post.reasoning?.map((r: string, i: number) => (
          <Box key={i} paddingLeft={2}>
            <Text color="white">{i + 1}. {r.substring(0, 100)}{r.length > 100 ? '...' : ''}</Text>
          </Box>
        ))}
        <Box marginTop={2}>
          <Text dimColor>Press </Text>
          <Text color="cyan">Esc</Text>
          <Text dimColor> or </Text>
          <Text color="cyan">q</Text>
          <Text dimColor> to close</Text>
        </Box>
      </Box>
    );
  }

  const statusColor = data.status === 'running' ? 'green' : 
                     data.status === 'paused' ? 'yellow' : 
                     data.status === 'failed' ? 'red' : 'green';

  return (
    <Box flexDirection="column" height="100%">
      {/* Header */}
      <Box height={3} borderStyle="double" borderColor="cyan" paddingX={1}>
        <Box>
          <Text bold color="cyan">AGORA DEBATE</Text>
          <Text color="gray"> - {topicId.substring(0, 30)}</Text>
        </Box>
        <Box>
          <Text color={statusColor}>{SPINNER[spinnerIdx]} {data.status.toUpperCase()}</Text>
          <Text color="gray"> | Round {data.current_round}/{data.total_rounds}</Text>
        </Box>
      </Box>

      {/* Main Content */}
      <Box flexGrow={1} flexDirection="row">
        {/* Left - Agents */}
        <Box width="25%" borderStyle="bold" borderColor="cyan" paddingX={1}>
          <Box marginBottom={1}>
            <Text bold>AGENTS</Text>
          </Box>
          {data.agents.map((agent: any, i: number) => {
            const isThinking = agent.status === 'thinking';
            return (
              <Box key={agent.role} marginBottom={1}>
                <Text color={isThinking ? 'cyan' : agent.status === 'posted' ? 'green' : 'gray'}>
                  {isThinking ? SPINNER[(spinnerIdx + i) % SPINNER.length] : agent.status === 'posted' ? '●' : '○'}
                </Text>
                <Text> {agent.role.substring(0, 10)}</Text>
              </Box>
            );
          })}
        </Box>

        {/* Center - Posts */}
        <Box width="50%" borderStyle="round" borderColor="white" paddingX={1}>
          <Box marginBottom={1}>
            <Text bold>THE FORUM</Text>
            <Text dimColor> (1-9 to expand)</Text>
          </Box>
          {data.recent_posts.slice(-6).map((post: any, idx: number) => {
            const displayNum = data.recent_posts.length - 6 + idx + 1;
            const isLatest = idx === 5 || idx === data.recent_posts.slice(-6).length - 1;
            return (
              <Box 
                key={idx} 
                borderStyle={isLatest ? "double" : "single"}
                borderColor={isLatest ? "cyan" : "white"}
                paddingX={1}
                marginBottom={1}
              >
                <Box>
                  <Text color="yellow">{displayNum}.</Text>
                  <Text bold> [{post.role}]</Text>
                  <Text dimColor> R{post.round}</Text>
                </Box>
                <Text>{post.position.substring(0, 60)}{post.position.length > 60 ? '...' : ''}</Text>
              </Box>
            );
          })}
        </Box>

        {/* Right - Blackboard */}
        <Box width="25%" borderStyle="single" borderColor="yellow" paddingX={1}>
          <Box marginBottom={1}>
            <Text bold>SYNTAGMA</Text>
          </Box>
          {data.blackboard.length === 0 ? (
            <Text dimColor>No items</Text>
          ) : (
            data.blackboard.slice(-4).map((item: any) => (
              <Box key={item.id} marginBottom={1} borderStyle="single" paddingX={1}>
                <Text color={item.type === 'consensus' ? 'green' : 'white'}>
                  {item.type === 'consensus' ? '✓' : '◆'} {item.type}
                </Text>
                <Text dimColor>{item.content.substring(0, 40)}...</Text>
              </Box>
            ))
          )}
        </Box>
      </Box>

      {/* Footer */}
      <Box height={2} borderStyle="classic" borderColor="green" paddingX={1}>
        <Text dimColor>q:quit | 1-9:expand | p:pause | r:resume | Esc:back</Text>
      </Box>
    </Box>
  );
};

// Main
const topicId = process.argv[2] || 'topic_20260309_cdcbdb';
const store = new BlackboardStore('.agora');

render(<Monitor topicId={topicId} store={store} />);
