import React from 'react';

export type HeaderProps = {
  question: string;
  status: 'running' | 'paused' | 'completed';
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
      case 'running': return '#9ece6a';
      case 'paused': return '#e0af68';
      case 'completed': return '#7aa2f7';
      default: return '#a9b1d6';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'running': return '● RUNNING';
      case 'paused': return '⏸ PAUSED';
      case 'completed': return '✓ COMPLETED';
      default: return '○ UNKNOWN';
    }
  };

  return (
    <box 
      style={{ 
        borderStyle: 'rounded', 
        borderColor: '#7aa2f7',
        padding: 1,
        flexDirection: 'column',
        height: '100%'
      }}
    >
      <box style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <text style={{ bold: true, color: '#bb9af7' }}>AGORÁ // {topicId.toUpperCase()}</text>
        <text>Round {round}/{totalRounds}</text>
        <text style={{ bold: true, color: getStatusColor() }}>{getStatusText()}</text>
      </box>
      <box style={{ marginTop: 1 }}>
        <text style={{ italic: true }}>{truncatedQuestion}</text>
      </box>
    </box>
  );
};
