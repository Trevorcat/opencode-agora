import React from 'react';
import { theme } from '../theme.js';

export type HeaderProps = {
  question: string;
  status: 'running' | 'paused' | 'completed' | 'failed';
  topicId: string;
  round: number;
  totalRounds: number;
};

export const Header: React.FC<HeaderProps> = ({ 
  question, 
  status, 
  topicId, 
  round, 
  totalRounds 
}) => {
  const truncatedQuestion = question.length > 50 ? `${question.substring(0, 47)}...` : question;

  const getStatusColor = () => {
    switch (status) {
      case 'running': return theme.accent.green;
      case 'paused': return theme.accent.yellow;
      case 'completed': return theme.accent.blue;
      case 'failed': return theme.accent.red;
      default: return theme.text.muted;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'running': return '● RUNNING';
      case 'paused': return '⏸ PAUSED';
      case 'completed': return '✅ COMPLETED';
      case 'failed': return '❌ FAILED';
      default: return '○ UNKNOWN';
    }
  };

  return (
    <box 
      style={{ 
        borderStyle: 'rounded', 
        borderColor: theme.accent.blue,
        width: '100%',
        height: 3,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <text style={{ bold: true, fg: theme.accent.mauve }}>AGORÁ // {topicId.toUpperCase()}</text>
      <text style={{ italic: true, fg: theme.text.muted }}>{truncatedQuestion}</text>
      <text>Round {round}/{totalRounds}</text>
      <text style={{ bold: true, fg: getStatusColor() }}>{getStatusText()}</text>
    </box>
  );
};
