import React from 'react';
import { Box, Text } from 'ink';

export type StatusBarProps = {
  round: number;
  totalRounds: number;
  paused: boolean;
  pendingGuidance: number;
};

export const StatusBar: React.FC<StatusBarProps> = ({ round, totalRounds, paused, pendingGuidance }) => {
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1} justifyContent="space-between">
      <Box>
        <Text color="cyan">Progress: Round {round}/{totalRounds}</Text>
      </Box>
      {pendingGuidance > 0 && (
        <Box>
          <Text backgroundColor="magenta" color="white" bold> {pendingGuidance} GUIDANCE </Text>
        </Box>
      )}
      <Box>
        <Text dimColor>
          [<Text color="white" bold>p</Text>]ause 
          {' '}[<Text color="white" bold>r</Text>]esume 
          {' '}[<Text color="white" bold>g</Text>]uidance 
          {' '}[<Text color="white" bold>q</Text>]uit
        </Text>
      </Box>
    </Box>
  );
};
