import React from 'react';
import { Box, Text } from 'ink';

export type BlackboardItem = {
  id: string;
  type: 'consensus' | 'checkpoint' | 'note' | 'guidance';
  content: string;
};

export type BlackboardPanelProps = {
  items: BlackboardItem[];
  maxItems?: number;
};

export function BlackboardPanel({ items, maxItems = 5 }: BlackboardPanelProps) {
  const visibleItems = items.slice(-maxItems);

  const getColorForType = (type: string) => {
    switch (type) {
      case 'consensus': return 'greenBright';
      case 'checkpoint': return 'blueBright';
      case 'note': return 'yellowBright';
      case 'guidance': return 'magentaBright';
      default: return 'white';
    }
  };

  const truncate = (text: string, len: number) => 
    text.length > len ? text.slice(0, len) + '...' : text;

  return (
    <Box flexDirection="column" borderStyle="double" borderColor="magenta" padding={1} width="100%">
      <Box paddingBottom={1}>
        <Text bold underline color="whiteBright">BLACKBOARD</Text>
      </Box>
      {visibleItems.length === 0 ? (
        <Text italic color="gray">No items pinned...</Text>
      ) : (
        visibleItems.map(item => (
          <Box key={item.id} flexDirection="row" marginBottom={1}>
            <Text color={getColorForType(item.type)}>[{item.type.toUpperCase()}] </Text>
            <Text color="whiteBright">{truncate(item.content, 80)}</Text>
          </Box>
        ))
      )}
    </Box>
  );
}
