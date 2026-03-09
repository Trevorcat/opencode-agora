import React from 'react';
import { Box, Text } from 'ink';
import { LiveStatus } from './Header';

export type AgentPanelProps = { agents: LiveStatus["agents"] };

export const AgentPanel: React.FC<AgentPanelProps> = ({ agents }) => {
  const getStatusIndicator = (status: string) => {
    switch (status) {
      case 'waiting': return <Text color="gray">●</Text>;
      case 'thinking': return <Text color="yellow">◐</Text>;
      case 'posted': return <Text color="green">✓</Text>;
      case 'error': return <Text color="red">✗</Text>;
      default: return <Text color="gray">●</Text>;
    }
  };

  return (
    <Box borderStyle="single" borderColor="blue" flexDirection="column" width={24} paddingX={1}>
      <Text bold underline color="white">Agents</Text>
      <Box flexDirection="column" marginTop={1}>
        {agents.map((agent) => (
          <Box key={agent.id} flexDirection="column" marginBottom={1}>
            <Box justifyContent="space-between">
              <Text bold>{agent.role}</Text>
              {getStatusIndicator(agent.status)}
            </Box>
            <Text dimColor>{agent.model}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
};
