import React from 'react';

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
    case 'consensus': return '#9ece6a';
    case 'checkpoint': return '#7aa2f7';
    case 'note': return '#e0af68';
    case 'guidance': return '#bb9af7';
    default: return '#a9b1d6';
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

export const BlackboardPanel: React.FC<BlackboardPanelProps> = ({ items }) => {
  const visibleItems = items.slice(-8);

  return (
    <box 
      style={{ 
        borderStyle: 'rounded', 
        borderColor: '#e0af68',
        padding: 1,
        flexDirection: 'column',
        height: '100%'
      }}
    >
      <box style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <text style={{ bold: true, color: '#ffffff' }}>SYNTAGMA</text>
        <text style={{ color: '#565f89' }}>[{items.length} items 🖱]</text>
      </box>

      {visibleItems.length === 0 ? (
        <box style={{ padding: 2 }}>
          <text style={{ italic: true, color: '#565f89' }}>No artifacts pinned yet...</text>
          <text style={{ color: '#565f89' }}>Use forum.pin_to_blackboard</text>
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
            
            return (
              <box 
                key={item.id}
                style={{ 
                  borderStyle: isLast ? 'bold' : 'single',
                  borderColor: typeColor,
                  padding: 1,
                  marginBottom: 1,
                  flexDirection: 'column'
                }}
              >
                <box style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <text style={{ color: typeColor }}>
                    {getTypeIcon(item.type)} {item.type.toUpperCase()}
                  </text>
                  {item.author && (
                    <text style={{ color: '#565f89' }}>
                      by {item.author.substring(0, 10)}{item.author.length > 10 ? '...' : ''}
                    </text>
                  )}
                </box>
                
                <box style={{ paddingLeft: 1, marginTop: 1 }}>
                  <text style={{ color: '#c0caf5' }}>
                    {item.content.substring(0, 35)}{item.content.length > 35 ? '...' : ''}
                  </text>
                </box>
                
                {item.timestamp && (
                  <box style={{ marginTop: 1 }}>
                    <text style={{ color: '#565f89' }}>
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
