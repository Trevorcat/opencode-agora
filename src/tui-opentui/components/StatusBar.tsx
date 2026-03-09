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
      
      <text style={{ color: '#565f89' }}>
        [<text style={{ bold: true, color: '#ffffff' }}>p</text>]ause 
        {' '}[<text style={{ bold: true, color: '#ffffff' }}>r</text>]esume 
        {' '}[<text style={{ bold: true, color: '#ffffff' }}>g</text>]uidance 
        {' '}[<text style={{ bold: true, color: '#ffffff' }}>q</text>]uit
        {' '}|🖱 Scroll
      </text>
    </box>
  );
};
