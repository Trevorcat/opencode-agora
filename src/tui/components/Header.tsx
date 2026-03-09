import React from 'react';
import { Box, Text } from 'ink';

export type LiveStatus = {
  status: 'running' | 'paused' | 'completed';
  agents: Array<{
    id: string;
    role: string;
    model: string;
    status: 'waiting' | 'thinking' | 'posted' | 'error';
  }>;
};

export type HeaderProps = {
  question: string;
  status: LiveStatus["status"];
  topicId: string;
  round: number;
  totalRounds: number;
};

export const Header: React.FC<HeaderProps> = ({ question, status, topicId, round, totalRounds }) => {
  const truncatedQuestion = question.length > 50 ? `${question.substring(0, 47)}...` : question;

  let statusBadge;
  if (status === 'running') {
    statusBadge = <Text color="green" bold>[● RUNNING]</Text>;
  } else if (status === 'paused') {
    statusBadge = <Text color="yellow" bold>[⏸ PAUSED]</Text>;
  } else {
    statusBadge = <Text color="green">✓ COMPLETED</Text>;
  }

  return (
    <Box borderStyle="round" borderColor="cyan" paddingX={1} flexDirection="column">
      <Box justifyContent="space-between" width="100%">
        <Text bold color="magenta">Topic {topicId}</Text>
        <Text>Round {round}/{totalRounds}</Text>
        {statusBadge}
      </Box>
      <Box marginTop={1}>
        <Text italic>{truncatedQuestion}</Text>
      </Box>
    </Box>
  );
};
