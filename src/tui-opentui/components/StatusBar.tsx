import React from 'react';

export type StatusBarProps = {
  round: number;
  totalRounds: number;
  paused: boolean;
  pendingGuidance: number;
  latestEvent?: string;
  status?: string;
};

export const StatusBar: React.FC<StatusBarProps> = ({ 
  round, 
  totalRounds, 
  paused, 
  pendingGuidance,
  latestEvent,
  status
}) => {
  let statusText = '● LIVE';
  let statusColor = '#9ece6a';
  if (status === 'completed') {
    statusText = '✓ COMPLETED';
    statusColor = '#7aa2f7';
  } else if (status === 'failed') {
    statusText = '✗ FAILED';
    statusColor = '#f7768e';
  } else if (paused) {
    statusText = '⏸ PAUSED';
    statusColor = '#f7768e';
  }

  return (
    <box 
      style={{ 
        borderStyle: 'single', 
        borderColor: '#565f89',
        width: '100%',
        height: 3,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <text style={{ color: '#7aa2f7' }}>Progress: Round {round}/{totalRounds}</text>

      {latestEvent && (
        <text style={{ color: '#565f89' }}>
          {latestEvent.length > 40 ? latestEvent.substring(0, 37) + '...' : latestEvent}
        </text>
      )}
      
      {pendingGuidance > 0 && (
        <text style={{ backgroundColor: '#bb9af7', color: '#1a1b26', bold: true }}>
          {' '}{pendingGuidance} GUIDANCE{' '}
        </text>
      )}
      
      <text style={{ bold: true, color: statusColor }}>
        {statusText}
      </text>
      
      <box style={{ flexDirection: 'row' }}>
        <text style={{ color: '#565f89' }}>[</text>
        <text style={{ bold: true, color: '#ffffff' }}>Tab</text>
        <text style={{ color: '#565f89' }}>] expand agent </text>
        <text style={{ color: '#565f89' }}>[</text>
        <text style={{ bold: true, color: '#ffffff' }}>p</text>
        <text style={{ color: '#565f89' }}>]ause </text>
        <text style={{ color: '#565f89' }}>[</text>
        <text style={{ bold: true, color: '#ffffff' }}>r</text>
        <text style={{ color: '#565f89' }}>]esume </text>
        <text style={{ color: '#565f89' }}>[</text>
        <text style={{ bold: true, color: '#ffffff' }}>g</text>
        <text style={{ color: '#565f89' }}>]uidance </text>
        <text style={{ color: '#565f89' }}>[</text>
        <text style={{ bold: true, color: '#ffffff' }}>q</text>
        <text style={{ color: '#565f89' }}>]uit |🖱 Scroll</text>
      </box>
    </box>
  );
};
