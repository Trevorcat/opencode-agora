import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

export type StatusBarProps = {
  round: number;
  totalRounds: number;
  paused: boolean;
  pendingGuidance: number;
  inputMode: 'normal' | 'guidance';
  guidanceText: string;
  setGuidanceText: (text: string) => void;
  onGuidanceSubmit: (text: string) => void;
  onCancelGuidance: () => void;
};

export const StatusBar: React.FC<StatusBarProps> = ({ 
  round, 
  totalRounds, 
  paused, 
  pendingGuidance,
  inputMode,
  guidanceText,
  setGuidanceText,
  onGuidanceSubmit,
  onCancelGuidance,
}) => {
  if (inputMode === 'guidance') {
    return (
      <Box borderStyle="single" borderColor="yellow" paddingX={1}>
        <Text color="yellowBright" bold>⚡ INJECT GUIDANCE ➔ </Text>
        <TextInput
          value={guidanceText}
          onChange={setGuidanceText}
          onSubmit={onGuidanceSubmit}
        />
        <Text dimColor> (Enter to send, Esc to cancel)</Text>
      </Box>
    );
  }

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
        <Text bold color={paused ? 'redBright' : 'greenBright'}>
          {paused ? '⏸ PAUSED' : '● LIVE'}
        </Text>
      </Box>
       <Box>
         <Text dimColor>
           [<Text color="white" bold>p</Text>]ause 
           {' '}[<Text color="white" bold>r</Text>]esume 
           {' '}[<Text color="white" bold>g</Text>]uidance 
           {' '}[<Text color="white" bold>q</Text>]uit
           {' '}|🖱 Click/Scroll
         </Text>
       </Box>
    </Box>
  );
};
