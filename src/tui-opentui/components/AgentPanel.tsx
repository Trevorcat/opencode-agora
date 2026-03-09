import React from 'react';

export type AgentStatus = "waiting" | "thinking" | "posted" | "error";

export type AgentPanelProps = {
  agents: Array<{
    role: string;
    model: string;
    status: AgentStatus;
  }>;
};

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const getAgentColor = (role: string): string => {
  const colors: Record<string, string> = {
    researcher: '#7aa2f7',
    optimist: '#9ece6a',
    pessimist: '#f7768e',
    ethicist: '#e0af68',
    moderator: '#bb9af7',
    default: '#a9b1d6',
  };
  return colors[role.toLowerCase()] || colors.default;
};

const getStatusIcon = (status: AgentStatus): string => {
  switch (status) {
    case 'thinking': return '⠋';
    case 'posted': return '✓';
    case 'error': return '✗';
    case 'waiting':
    default: return '○';
  }
};

const getStatusColor = (status: AgentStatus): string => {
  switch (status) {
    case 'thinking': return '#e0af68';
    case 'posted': return '#9ece6a';
    case 'error': return '#f7768e';
    case 'waiting':
    default: return '#565f89';
  }
};

export const AgentPanel: React.FC<AgentPanelProps> = ({ agents }) => {
  return (
    <box 
      style={{ 
        borderStyle: 'bold', 
        borderColor: '#7aa2f7',
        padding: 1,
        flexDirection: 'column',
        height: '100%'
      }}
    >
      <text style={{ bold: true, color: '#ffffff' }}>AGENTS</text>
      
      <box style={{ flexDirection: 'column', marginTop: 1, gap: 1 }}>
        {agents.map((agent, index) => {
          const roleColor = getAgentColor(agent.role);
          const statusIcon = getStatusIcon(agent.status);
          const statusColor = getStatusColor(agent.status);
          
          return (
            <box 
              key={index}
              style={{ 
                borderStyle: 'single',
                borderColor: roleColor,
                padding: 1,
                flexDirection: 'column'
              }}
            >
              <text style={{ bold: true, color: roleColor }}>
                [{agent.role.toUpperCase()}]
              </text>
              <text style={{ color: '#565f89' }}>{agent.model}</text>
              <text style={{ color: statusColor }}>
                {statusIcon} {agent.status.toUpperCase()}
              </text>
            </box>
          );
        })}
      </box>
    </box>
  );
};
