import React from 'react';

export type StatusBarProps = {
  round: number;
  totalRounds: number;
  paused: boolean;
  pendingGuidance: number;
};

export const StatusBar: React.FC<StatusBarProps> = ({ 
  round, 
  totalRounds, 
  paused, 
  pendingGuidance 
}) => {
  return (
    <box 
      style={{ 
        borderStyle: 'single', 
        borderColor: '#565f89',
        padding: 1,
        flexDirection: 'row',
        justifyContent: 'space-between',
        height: '100%'
      }}
    >
      <text style={{ color: '#7aa2f7' }}>Progress: Round {round}/{totalRounds}</text>
      
      {pendingGuidance > 0 && (
        <text style={{ backgroundColor: '#bb9af7', color: '#1a1b26', bold: true }}>
          {' '}{pendingGuidance} GUIDANCE{' '}
        </text>
      )}
      
      <text style={{ bold: true, color: paused ? '#f7768e' : '#9ece6a' }}>
        {paused ? '⏸ PAUSED' : '● LIVE'}
      </text>
      
      <box style={{ flexDirection: 'row' }}>
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
