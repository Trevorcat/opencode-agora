import React from 'react';
import { Box, Text } from 'ink';
import { AnimatedStatus, StatusType } from './AnimatedStatus.js';
import { BORDERS, getAgentColor, BOX } from '../design-tokens.js';

export interface AgentData {
  id: string;
  role: string;
  model: string;
  status: string;
  progress?: number;
}

export interface AgentPanelProps {
  agents: AgentData[];
}

export const AgentPanel: React.FC<AgentPanelProps> = ({ agents }) => {
  return (
    <Box 
      borderStyle={BORDERS.agents} 
      borderColor={getAgentColor('user')} 
      flexDirection="column" 
      paddingX={1}
      height="100%"
    >
      <Box paddingBottom={1}>
        <Text bold color="white">AGENTS {BOX.horizontal.repeat(10)}</Text>
      </Box>

      <Box flexDirection="column" gap={1}>
        {agents.map((agent) => {
          const color = getAgentColor(agent.role);
          const st = agent.status as StatusType;
          return (
            <Box key={agent.id} flexDirection="column" borderStyle="single" borderColor={color} paddingX={1}>
              <Box justifyContent="space-between">
                <Text bold color={color}>[{agent.role.toUpperCase()}]</Text>
              </Box>
              <Text dimColor wrap="truncate">{agent.model}</Text>
              <Box marginTop={1}>
                <AnimatedStatus 
                  status={st} 
                  progress={agent.progress} 
                  label={agent.status.toUpperCase()} 
                />
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};
