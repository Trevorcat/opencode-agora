import React, { useState } from 'react';
import { theme } from '../theme.js';

export type BlackboardItemType = 'consensus' | 'checkpoint' | 'note' | 'guidance';

export interface BlackboardItem {
  id: string;
  type: BlackboardItemType;
  content: string;
  timestamp?: string;
  author?: string;
}

export type BlackboardPanelProps = {
  items: BlackboardItem[];
};

const getTypeColor = (type: string): string => {
  switch (type) {
    case 'consensus': return theme.accent.green;
    case 'checkpoint': return theme.accent.blue;
    case 'note': return theme.accent.yellow;
    case 'guidance': return theme.accent.mauve;
    default: return theme.text.muted;
  }
};

const getTypeIcon = (type: string): string => {
  switch (type) {
    case 'consensus': return '✅';
    case 'checkpoint': return '📌';
    case 'note': return '📝';
    case 'guidance': return '⚡';
    default: return '▪';
  }
};

export const BlackboardPanel: React.FC<BlackboardPanelProps> = ({ items }) => {
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const visibleItems = items.slice(-8);

  return (
    <box 
      style={{ 
        borderStyle: 'rounded', 
        borderColor: theme.accent.yellow,
        width: '100%',
        height: '100%',
        flexDirection: 'column',
      }}
    >
      <box style={{ flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 1, paddingRight: 1 }}>
        <text style={{ bold: true, color: theme.text.primary }}>BLACKBOARD [{items.length}]</text>
        <text style={{ color: theme.text.dim }}>(Click to expand)</text>
      </box>

      {visibleItems.length === 0 ? (
        <box style={{ paddingLeft: 1, paddingTop: 1, flexDirection: 'column' }}>
          <text style={{ italic: true, color: theme.text.dim }}>No artifacts pinned yet...</text>
          <text style={{ color: theme.text.dim }}>Use forum.pin_to_blackboard</text>
        </box>
      ) : (
        <scrollbox
          style={{
            flexGrow: 1,
            marginTop: 1,
            scrollY: true,
          }}
        >
          {visibleItems.map((item, index) => {
            const typeColor = getTypeColor(item.type);
            const isLast = index === visibleItems.length - 1;
            const isExpanded = expandedItemId === item.id;
            const content = isExpanded 
              ? item.content 
              : `${item.content.substring(0, 35)}${item.content.length > 35 ? '...' : ''}`;
            
            return (
              <box 
                key={item.id}
                style={{ 
                  borderStyle: isExpanded ? 'double' : (isLast ? 'bold' : 'single'),
                  borderColor: typeColor,
                  padding: 1,
                  marginBottom: 1,
                  flexDirection: 'column'
                }}
                // @ts-ignore OpenTUI mouse event
                onMouseDown={() => setExpandedItemId(isExpanded ? null : item.id)}
              >
                <box style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <text style={{ color: typeColor }}>
                    {getTypeIcon(item.type)} {item.type.toUpperCase()}{isExpanded ? ' [EXPANDED]' : ''}
                  </text>
                  {item.author && (
                    <text style={{ color: theme.text.dim }}>
                      by {item.author.substring(0, 10)}{item.author.length > 10 ? '...' : ''}
                    </text>
                  )}
                </box>
                
                <box style={{ paddingLeft: 1, marginTop: 1 }}>
                  <text style={{ color: theme.text.primary }}>{content}</text>
                </box>
                
                {item.timestamp && (
                  <box style={{ marginTop: 1 }}>
                    <text style={{ color: theme.text.dim }}>
                      {new Date(item.timestamp).toLocaleTimeString()}
                    </text>
                  </box>
                )}
              </box>
            );
          })}
        </scrollbox>
      )}
    </box>
  );
};
