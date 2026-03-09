import React from 'react';
import { Box, Text } from 'ink';
import { BORDERS, SCROLLBAR } from '../design-tokens.js';

export type BlackboardItemType = 'consensus' | 'checkpoint' | 'note' | 'guidance';

export interface BlackboardItem {
  id: string;
  type: BlackboardItemType;
  content: string;
  timestamp?: string;
  author?: string;
}

export interface BlackboardPanelProps {
  items: BlackboardItem[];
  maxItems?: number;
}

export function BlackboardPanel({ items, maxItems = 8 }: BlackboardPanelProps) {
  const visibleItems = items.slice(-maxItems);

  const getTypeColor = (type: string): string => {
    switch (type) {
      case 'consensus': return 'green';
      case 'checkpoint': return 'blue';
      case 'note': return 'yellow';
      case 'guidance': return 'magenta';
      default: return 'white';
    }
  };

  const getTypeIcon = (type: string): string => {
    switch (type) {
      case 'consensus': return '✓';
      case 'checkpoint': return '◆';
      case 'note': return '◈';
      case 'guidance': return '⚡';
      default: return '▪';
    }
  };

  const truncate = (text: string, len: number): string => 
    text.length > len ? text.slice(0, len - 3) + '...' : text;

  return (
    <Box 
      flexDirection="column" 
      height="100%"
      borderStyle={BORDERS.blackboard}
      borderColor="yellow"
      paddingX={1}
    >
      {/* Header */}
      <Box paddingBottom={1} justifyContent="space-between">
        <Text bold color="white">SYNTAGMA</Text>
        <Text dimColor>[{items.length} items 🖱]</Text>
      </Box>

      {/* Content Area */}
      <Box flexDirection="column" flexGrow={1}>
        {visibleItems.length === 0 ? (
          <Box paddingY={2}>
            <Text italic color="gray">No artifacts pinned yet...</Text>
            <Text dimColor>Use forum.pin_to_blackboard</Text>
          </Box>
        ) : (
          <Box flexDirection="column">
            {visibleItems.map((item, index) => {
              const typeColor = getTypeColor(item.type);
              const isLast = index === visibleItems.length - 1;
              
              return (
                <Box 
                  key={item.id} 
                  flexDirection="column"
                  borderStyle={isLast ? "bold" : "single"}
                  borderColor={typeColor}
                  paddingX={1}
                  paddingY={1}
                  marginBottom={1}
                >
                  {/* Item Header */}
                  <Box justifyContent="space-between" marginBottom={1}>
                    <Box>
                      <Text color={typeColor}>{getTypeIcon(item.type)}</Text>
                      <Text color={typeColor} bold> {item.type.toUpperCase()}</Text>
                    </Box>
                    {item.author && (
                      <Text dimColor>by {truncate(item.author, 10)}</Text>
                    )}
                  </Box>

                  {/* Item Content */}
                  <Box paddingLeft={1}>
                    <Text color="whiteBright">{truncate(item.content, 35)}</Text>
                  </Box>

                  {/* Timestamp if available */}
                  {item.timestamp && (
                    <Box marginTop={1}>
                      <Text dimColor>{new Date(item.timestamp).toLocaleTimeString()}</Text>
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>
        )}
      </Box>

      {/* Scrollbar indicator */}
      {items.length > maxItems && (
        <Box justifyContent="flex-end" paddingTop={1}>
          <Text dimColor>
            {SCROLLBAR.up} {items.length - maxItems} more {SCROLLBAR.down}
          </Text>
        </Box>
      )}
    </Box>
  );
}
