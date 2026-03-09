import React from 'react';
import { theme } from '../theme.js';

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
  let statusColor = theme.accent.green;
  if (status === 'completed') {
    statusText = '✅ COMPLETED';
    statusColor = theme.accent.blue;
  } else if (status === 'failed') {
    statusText = '❌ FAILED';
    statusColor = theme.accent.red;
  } else if (paused) {
    statusText = '⏸ PAUSED';
    statusColor = theme.accent.yellow;
  }

  return (
    <box 
      style={{ 
        borderStyle: 'single', 
        borderColor: theme.text.dim,
        width: '100%',
        height: 3,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <text style={{ color: theme.accent.blue }}>Progress: Round {round}/{totalRounds}</text>

      {latestEvent && (
        <text style={{ color: theme.text.dim }}>
          {latestEvent.length > 40 ? latestEvent.substring(0, 37) + '...' : latestEvent}
        </text>
      )}
      
      {pendingGuidance > 0 && (
        <text style={{ backgroundColor: theme.accent.mauve, color: theme.bg.primary, bold: true }}>
          {' '}{pendingGuidance} GUIDANCE{' '}
        </text>
      )}
      
      <text style={{ bold: true, color: statusColor }}>
        {statusText}
      </text>
      
      <box style={{ flexDirection: 'row' }}>
        <text style={{ color: theme.text.dim }}>[</text>
        <text style={{ bold: true, color: theme.text.primary }}>Tab</text>
        <text style={{ color: theme.text.dim }}>] expand agent </text>
        <text style={{ color: theme.text.dim }}>[</text>
        <text style={{ bold: true, color: theme.text.primary }}>p</text>
        <text style={{ color: theme.text.dim }}>]ause </text>
        <text style={{ color: theme.text.dim }}>[</text>
        <text style={{ bold: true, color: theme.text.primary }}>r</text>
        <text style={{ color: theme.text.dim }}>]esume </text>
        <text style={{ color: theme.text.dim }}>[</text>
        <text style={{ bold: true, color: theme.text.primary }}>g</text>
        <text style={{ color: theme.text.dim }}>]uidance </text>
        <text style={{ color: theme.text.dim }}>[</text>
        <text style={{ bold: true, color: theme.text.primary }}>q</text>
        <text style={{ color: theme.text.dim }}>]uit |🖱 Scroll</text>
      </box>
    </box>
  );
};
