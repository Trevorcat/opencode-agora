import React, { useState, useEffect, useCallback } from 'react';
// @ts-ignore
import { useKeyboard } from '@opentui/react';
import type { BlackboardStore } from '../../blackboard/store.js';
import type { AvailableModel } from '../../config/opencode-loader.js';
import { theme, getAgentColor, getAgentSymbol } from '../theme.js';
import { getRoleDisplayName } from '../../utils/role-localization.js';

// ─── Mouse-aware Model Selector ───────────────────────────────────────────────
// OpenTUI's <select> has no mouse support, so we build our own scrollable list.
const VISIBLE_ROWS = 6;

type ModelSelectorProps = {
  models: AvailableModel[];
  currentModel: string;
  onSelect: (modelId: string) => void;
};

const ModelSelector: React.FC<ModelSelectorProps> = ({ models, currentModel, onSelect }) => {
  const initialIndex = Math.max(0, models.findIndex(m => m.id === currentModel));
  const [scrollOffset, setScrollOffset] = useState(() => {
    const idx = models.findIndex(m => m.id === currentModel);
    return Math.max(0, Math.min(idx, models.length - VISIBLE_ROWS));
  });
  const [cursorIdx, setCursorIdx] = useState(initialIndex);

  const visibleModels = models.slice(scrollOffset, scrollOffset + VISIBLE_ROWS);
  const canScrollUp = scrollOffset > 0;
  const canScrollDown = scrollOffset + VISIBLE_ROWS < models.length;

  const moveUp = useCallback(() => {
    setCursorIdx((prev) => {
      const next = Math.max(0, prev - 1);
      setScrollOffset((offset) => (next < offset ? next : offset));
      return next;
    });
  }, []);

  const moveDown = useCallback(() => {
    setCursorIdx((prev) => {
      const next = Math.min(models.length - 1, prev + 1);
      setScrollOffset((offset) => {
        const maxOffset = Math.max(0, models.length - VISIBLE_ROWS);
        if (next >= offset + VISIBLE_ROWS) {
          return Math.min(maxOffset, next - VISIBLE_ROWS + 1);
        }
        return offset;
      });
      return next;
    });
  }, [models.length]);

  // Keyboard: up/down to scroll, enter to select hovered
  useKeyboard((key: { name: string }) => {
    if (key.name === 'up') moveUp();
    else if (key.name === 'down') moveDown();
    else if (key.name === 'return') {
      const selected = models[cursorIdx];
      if (selected) onSelect(selected.id);
    }
  });

  return (
    <box style={{ flexDirection: 'column', marginTop: 1 }}>
      {/* Scroll up indicator */}
      <text style={{ fg: canScrollUp ? theme.text.secondary : theme.text.dim }}>
        {canScrollUp ? '  ▲ scroll up' : ''}
      </text>

      {/* Visible model rows */}
      {visibleModels.map((model) => {
        const isCurrent = model.id === currentModel;
        const isCursor = model.id === models[cursorIdx]?.id;
        const rowBg = isCurrent ? theme.accent.steelBlue : theme.bg.secondary;
        const rowFg = isCurrent ? theme.bg.primary : theme.text.primary;
        const prefix = isCurrent ? '● ' : isCursor ? '▶ ' : '  ';

        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI uses terminal mouse events on box nodes.
          <box
            key={model.id}
            style={{
              backgroundColor: rowBg,
              paddingLeft: 1,
              paddingRight: 1,
              height: 1,
            }}
            // @ts-ignore OpenTUI mouse event
            onMouseDown={() => onSelect(model.id)}
            // @ts-ignore OpenTUI keyboard event
            onKeyDown={(e: { key?: { name?: string } }) => {
              const name = e?.key?.name;
              if (name === 'return' || name === 'space') onSelect(model.id);
            }}
          >
             <text style={{ fg: rowFg }}>{prefix}{model.name}</text>
           </box>
        );
      })}

      {/* Scroll down indicator */}
      <text style={{ fg: canScrollDown ? theme.text.secondary : theme.text.dim }}>
        {canScrollDown ? '  ▼ scroll down' : ''}
      </text>
    </box>
  );
};

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
  language?: string;
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
  language,
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
      <text style={{ bold: false, fg: theme.text.primary }}> AGENTS</text>
      
      {agents.map((agent, agentIdx) => {
        const roleColor = getAgentColor(agent.role);
        const roleSymbol = getAgentSymbol(agent.role);
        const roleLabel = getRoleDisplayName(agent.role, language).toUpperCase();
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
              key={agentIdx.toString()}
              style={{
                borderStyle: 'double',
                borderColor: roleColor,
                flexDirection: 'column',
                marginBottom: 1,
              }}
            >
              {/* Header row: click here to collapse */}
              {/* biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI uses terminal mouse events on box nodes. */}
              <box
                style={{ flexDirection: 'row' }}
                // @ts-ignore OpenTUI mouse event
                onMouseDown={() => setExpandedRole(null)}
                // @ts-ignore OpenTUI keyboard event
                onKeyDown={(e: { key?: { name?: string } }) => {
                  const name = e?.key?.name;
                  if (name === 'return' || name === 'space') setExpandedRole(null);
                }}
              >
                <text style={{ bold: true, fg: roleColor }}>{' '}{roleSymbol}{' ['}{roleLabel}{'] ▼'}</text>
              </box>
              <text style={{ fg: statusColor }}>{' '}{statusIcon}{' '}{statusLabel}</text>
              <text style={{ fg: theme.text.dim }}>{' Model: '}{agent.model}</text>
              
              {/* Persona (full in expanded view) */}
              {agent.persona && (
                <box style={{ paddingLeft: 1, marginTop: 1 }}>
                  <text style={{ fg: theme.text.muted, italic: true }}>{agent.persona.substring(0, 200)}</text>
                </box>
              )}

              {/* Model selector */}
              {availableModels && availableModels.length > 0 && (
                <box style={{ flexDirection: 'column' }}>
                  <text style={{ fg: theme.accent.warmSand, bold: true }}> Switch model:</text>
                  <ModelSelector
                    models={availableModels}
                    currentModel={agent.model}
                    onSelect={(modelId) => {
                      if (store && topicId) {
                        store.updateAgentModel(topicId, agent.role, modelId).catch(console.error);
                      }
                    }}
                  />
                </box>
              )}

              {/* Streaming text */}
              {agent.streaming_text && (
                <text style={{ fg: theme.text.dim }}>{' '}{agent.streaming_text.substring(0, 40)}</text>
              )}
            </box>
          );
        }

        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI uses terminal mouse events on box nodes.
          <box 
            key={agentIdx.toString()}
            style={{ 
              borderStyle: 'single',
              borderColor: roleColor,
              flexDirection: 'column',
              marginBottom: 1,
            }}
            // @ts-ignore OpenTUI mouse event
            onMouseDown={() => setExpandedRole(expandedRole === agent.role ? null : agent.role)}
            // @ts-ignore OpenTUI keyboard event
            onKeyDown={(e: { key?: { name?: string } }) => {
              const name = e?.key?.name;
              if (name === 'return' || name === 'space') {
                setExpandedRole(expandedRole === agent.role ? null : agent.role);
              }
            }}
          >
            <text style={{ bold: true, fg: roleColor }}>{' '}{roleSymbol}{' ['}{roleLabel}{']'}</text>
            <text style={{ fg: theme.text.dim }}>{' '}{agent.model}</text>
            <text style={{ fg: statusColor }}>{' '}{statusIcon}{' '}{statusLabel}</text>
            {agent.streaming_text && (
              <text style={{ fg: theme.text.dim }}>{' '}{agent.streaming_text.substring(0, 40)}</text>
            )}
          </box>
        );
      })}
    </box>
  );
};
