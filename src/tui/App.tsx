import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import { Layout } from './components/Layout.js';

// Minimal mock types to satisfy the requirements
export interface BlackboardStore {
  getState: () => any;
  subscribe: (listener: () => void) => () => void;
}

export interface DebateController {
  pause: () => void;
  resume: () => void;
  injectGuidance: (guidance: string) => void;
  getStatus: () => 'Running' | 'Paused' | 'Stopped';
}

export type AppProps = {
  topicId: string;
  store: BlackboardStore;
  controller: DebateController;
};

export const App: React.FC<AppProps> = ({ topicId, store, controller }) => {
  const { exit } = useApp();
  const [inputMode, setInputMode] = useState<'normal' | 'guidance'>('normal');
  const [guidanceText, setGuidanceText] = useState('');
  const [status, setStatus] = useState<'Running' | 'Paused' | 'Stopped'>('Running');

  // LiveStatusPoller
  useEffect(() => {
    const interval = setInterval(() => {
      setStatus(controller.getStatus());
    }, 1000);
    return () => clearInterval(interval);
  }, [controller]);

  useInput((input, key) => {
    if (inputMode === 'normal') {
      if (input === 'q') {
        exit();
      } else if (input === 'p') {
        controller.pause();
        setStatus('Paused');
      } else if (input === 'r') {
        controller.resume();
        setStatus('Running');
      } else if (input === 'g') {
        setInputMode('guidance');
      }
    } else if (inputMode === 'guidance') {
      // Escape handling is built-in by not intercepting all typing, but we need to escape manually if needed.
      // ink-text-input handles standard typing. We just watch for Enter.
    }
  });

  const handleGuidanceSubmit = (value: string) => {
    if (value.trim()) {
      controller.injectGuidance(value);
    }
    setGuidanceText('');
    setInputMode('normal');
  };

  return (
    <Layout
      header={
        <Box justifyContent="center" width="100%">
          <Text bold color="magentaBright">AGORÁ // DEBATE VECTOR: </Text>
          <Text color="whiteBright">{topicId.toUpperCase()}</Text>
        </Box>
      }
      leftPanel={
        <Box flexDirection="column">
          <Text bold color="cyanBright">AGENT POOL</Text>
          <Text dimColor>Loading models...</Text>
        </Box>
      }
      centerPanel={
        <Box flexDirection="column">
          <Text bold color="whiteBright">GLOBAL POST FEED</Text>
          <Text dimColor>Awaiting transmissions...</Text>
        </Box>
      }
      rightPanel={
        <Box flexDirection="column">
          <Text bold color="yellowBright">BLACKBOARD STATE</Text>
          <Text dimColor>Syncing artifacts...</Text>
        </Box>
      }
      footer={
        <Box flexDirection="row" justifyContent="space-between" width="100%" paddingX={1}>
          <Box>
            {inputMode === 'guidance' ? (
              <Box>
                <Text color="yellowBright" bold>⚡ INJECT GUIDANCE ➔ </Text>
                <TextInput
                  value={guidanceText}
                  onChange={setGuidanceText}
                  onSubmit={handleGuidanceSubmit}
                />
                <Text dimColor> (Press Enter to send)</Text>
              </Box>
            ) : (
              <Box>
                <Text color="cyanBright">[P]</Text>
                <Text>ause  </Text>
                <Text color="cyanBright">[R]</Text>
                <Text>esume  </Text>
                <Text color="cyanBright">[G]</Text>
                <Text>uidance  </Text>
                <Text color="redBright">[Q]</Text>
                <Text>uit</Text>
              </Box>
            )}
          </Box>
          <Box>
            <Text bold color={status === 'Running' ? 'greenBright' : 'redBright'}>
              {status === 'Running' ? '● LIVE' : '■ PAUSED'}
            </Text>
          </Box>
        </Box>
      }
    />
  );
};
