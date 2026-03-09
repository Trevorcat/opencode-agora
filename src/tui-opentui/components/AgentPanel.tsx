import React, { useState, useEffect } from 'react';
// @ts-ignore
import { useKeyboard } from '@opentui/react';
import type { BlackboardStore } from '../../blackboard/store.js';
import type { AvailableModel } from '../../config/opencode-loader.js';
import { theme, getAgentColor } from '../theme.js';

export type AgentStatus = "waiting" | "thinking" | "posted" | "error";

export type AgentPanelProps = {
  agents: Array<{
    role: string;
    model: string;
    status: AgentStatus;
    streaming_text?: string;
    persona?: string;
  }>;
  availableModels?: AvailableModel[];
  topicId?: string;
  store?: BlackboardStore;
  /** Controlled expanded agent role (lifted to parent for keyboard gating) */
  expandedRole?: string | null;
  /** Callback when expanded role changes */
  onExpandChange?: (role: string | null) => void;
  /** Whether agents are in "preparing next round" state */
  isPreparingRound?: boolean;
};

const getStatusIcon = (status: AgentStatus, frame: number = 0): string => {
  switch (status) {
    case 'thinking': return theme.status.thinkingFrames[frame];
    case 'posted': return theme.status.posted;
    case 'error': return theme.status.error;
    case 'waiting':
    default: return theme.status.waiting;
  }
};

const getStatusColor = (status: AgentStatus): string => {
  switch (status) {
    case 'thinking': return theme.accent.yellow;
    case 'posted': return theme.accent.green;
    case 'error': return theme.accent.red;
    case 'waiting':
    default: return theme.text.dim;
  }
};

export const AgentPanel: React.FC<AgentPanelProps> = ({ 
  agents, 
  availableModels, 
  topicId, 
  store,
  expandedRole: controlledExpandedRole,
  onExpandChange,
  isPreparingRound = false,
}) => {
  const [frame, setFrame] = useState(0);
  const [pulseFrame, setPulseFrame] = useState(0);
  const [localExpandedRole, setLocalExpandedRole] = useState<string | null>(null);

  // Use controlled or local state
  const expandedRole = controlledExpandedRole !== undefined ? controlledExpandedRole : localExpandedRole;
  const setExpandedRole = (role: string | null) => {
    setLocalExpandedRole(role);
    onExpandChange?.(role);
  };

  useKeyboard((key: { name: string }) => {
    if (!expandedRole) return;
    if (key.name === 'escape') {
      setExpandedRole(null);
    }
  });

  // Braille spinner for thinking agents
  useEffect(() => {
    const hasThinking = agents.some(a => a.status === 'thinking');
    if (!hasThinking) return;

    const interval = setInterval(() => {
      setFrame(f => (f + 1) % 10);
    }, 80);

    return () => clearInterval(interval);
  }, [agents]);

  // Pulse animation for preparing state
  useEffect(() => {
    if (!isPreparingRound) return;
    const interval = setInterval(() => {
      setPulseFrame(f => (f + 1) % 4);
    }, 300);
    return () => clearInterval(interval);
  }, [isPreparingRound]);

  return (
    <box 
      style={{ 
        borderStyle: 'single', 
        borderColor: theme.accent.blue,
        width: '100%',
        flexDirection: 'column',
      }}
    >
      <text style={{ bold: true, color: theme.text.primary }}> AGENTS</text>
      
      {agents.map((agent, index) => {
        const roleColor = getAgentColor(agent.role);
        const isPreparingThis = isPreparingRound && agent.status === 'posted';
        const statusIcon = isPreparingThis
          ? theme.status.preparingFrames[pulseFrame]
          : getStatusIcon(agent.status, frame);
        const statusColor = isPreparingThis ? theme.accent.mauve : getStatusColor(agent.status);
        const statusLabel = isPreparingThis ? 'PREPARING' : agent.status.toUpperCase();
        const isExpanded = expandedRole === agent.role;
        
        if (isExpanded) {
          return (
            <box
              key={index}
              style={{
                borderStyle: 'double',
                borderColor: roleColor,
                flexDirection: 'column',
                marginBottom: 1,
              }}
              // @ts-ignore OpenTUI mouse event
              onMouseDown={() => setExpandedRole(null)}
            >
              <text style={{ bold: true, color: roleColor }}>{' ['}{agent.role.toUpperCase()}{'] ▼'}</text>
              <text style={{ color: statusColor }}>{' '}{statusIcon}{' '}{statusLabel}</text>
              <text style={{ color: theme.text.dim }}>{' Model: '}{agent.model}</text>
              
              {/* Persona (full in expanded view) */}
              {agent.persona && (
                <box style={{ paddingLeft: 1, marginTop: 1 }}>
                  <text style={{ color: theme.text.muted, italic: true }}>{agent.persona.substring(0, 200)}</text>
                </box>
              )}

              {/* Model selector */}
              {availableModels && availableModels.length > 0 && (
                <box style={{ marginTop: 1, height: Math.min(availableModels.length + 1, 6) }}>
                  <text style={{ color: theme.accent.yellow, bold: true }}> Switch model:</text>
                  <select
                    options={availableModels.map(m => ({
                      name: m.name,
                      description: m.provider,
                      value: m.id,
                    }))}
                    focused={isExpanded}
                    selectedIndex={availableModels.findIndex(m => m.id === agent.model)}
                    showDescription={true}
                    showScrollIndicator={true}
                    style={{
                      selectedBackgroundColor: theme.bg.highlight,
                      selectedTextColor: theme.accent.blue,
                      textColor: theme.text.muted,
                      backgroundColor: theme.bg.primary,
                    }}
                    // @ts-ignore OpenTUI select event
                    onSelect={(_idx: number, option: any) => {
                      if (option?.value && store && topicId) {
                        store.updateAgentModel(topicId, agent.role, option.value).catch(console.error);
                      }
                    }}
                  />
                </box>
              )}

              {/* Streaming text */}
              {agent.streaming_text && (
                <text style={{ color: theme.text.dim }}>{' '}{agent.streaming_text.substring(0, 40)}</text>
              )}
            </box>
          );
        }

        return (
          <box 
            key={index}
            style={{ 
              borderStyle: 'single',
              borderColor: roleColor,
              flexDirection: 'column',
              marginBottom: 1,
            }}
            // @ts-ignore OpenTUI mouse event
            onMouseDown={() => setExpandedRole(expandedRole === agent.role ? null : agent.role)}
          >
            <text style={{ bold: true, color: roleColor }}>{' ['}{agent.role.toUpperCase()}{']'}</text>
            <text style={{ color: theme.text.dim }}>{' '}{agent.model}</text>
            <text style={{ color: statusColor }}>{' '}{statusIcon}{' '}{statusLabel}</text>
            {agent.streaming_text && (
              <text style={{ color: theme.text.dim }}>{' '}{agent.streaming_text.substring(0, 40)}</text>
            )}
          </box>
        );
      })}
    </box>
  );
};
