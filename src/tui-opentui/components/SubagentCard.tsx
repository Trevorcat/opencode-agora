import React, { useState, useEffect } from "react";
import type { LiveStatus } from "../../blackboard/types.js";
import { theme, getAgentColor, getAgentSymbol } from "../theme.js";
import { getRoleDisplayName } from "../../utils/role-localization.js";

export type SubagentCardProps = {
  topicId: string;
  liveStatus: LiveStatus | null;
  /** If true, render as a compact floating card; if false, render inline */
  floating?: boolean;
  /** Called when user wants to expand into full debate view */
  onExpand?: () => void;
  /** Called when user wants to dismiss the card */
  onDismiss?: () => void;
};

export const SubagentCard: React.FC<SubagentCardProps> = ({
  topicId,
  liveStatus,
  floating = true,
  onExpand,
  onDismiss,
}) => {
  const [frame, setFrame] = useState(0);
  const liveStatusState = liveStatus?.status;

  // Spinner animation
  useEffect(() => {
    if (!liveStatusState || liveStatusState === "completed" || liveStatusState === "failed") return;
    const interval = setInterval(() => {
      setFrame(f => (f + 1) % 10);
    }, 80);
    return () => clearInterval(interval);
  }, [liveStatusState]);

  if (!liveStatus) {
    return (
      <box
        style={{
          ...(floating ? {
            position: "absolute" as const,
            top: 1,
            right: 1,
            width: 44,
            height: 5,
          } : {}),
          borderStyle: "rounded",
          borderColor: theme.accent.blue,
          backgroundColor: theme.bg.secondary,
          padding: 1,
          flexDirection: "column",
        }}
      >
        <text style={{ fg: theme.accent.blue }}>
          {theme.status.thinkingFrames[frame]} Loading {topicId}...
        </text>
      </box>
    );
  }

  const statusColor =
    liveStatus.status === "completed" ? theme.accent.green
    : liveStatus.status === "failed" ? theme.accent.red
    : liveStatus.status === "paused" ? theme.accent.yellow
    : theme.accent.blue;

  const statusIcon =
    liveStatus.status === "completed" ? "✅"
    : liveStatus.status === "failed" ? "❌"
    : liveStatus.status === "paused" ? "⏸"
    : theme.status.thinkingFrames[frame];

  const safeQuestion = liveStatus.question || liveStatus.topic_id;
  const truncatedQuestion = safeQuestion.length > 30
    ? safeQuestion.substring(0, 27) + "..."
    : safeQuestion;

  // Count agent statuses
  const thinking = liveStatus.agents.filter(a => a.status === "thinking").length;
  const posted = liveStatus.agents.filter(a => a.status === "posted").length;
  const total = liveStatus.agents.length;

  return (
    <box
      style={{
        ...(floating ? {
          position: "absolute" as const,
          top: 1,
          right: 1,
          width: 44,
          height: 8,
        } : {
          width: 44,
          height: 8,
        }),
        borderStyle: "double",
        borderColor: statusColor,
        backgroundColor: theme.bg.secondary,
        flexDirection: "column",
        padding: 1,
      }}
    >
      {/* Header */}
      <box style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <text style={{ bold: true, fg: theme.accent.mauve }}>⬡ AGORA</text>
        <text style={{ fg: statusColor, bold: true }}>{statusIcon}</text>
      </box>

      {/* Topic */}
      <text style={{ fg: theme.text.primary }}>{truncatedQuestion}</text>

      {/* Progress bar */}
      <box style={{ flexDirection: "row", marginTop: 1 }}>
        <text style={{ fg: theme.text.dim }}>R{liveStatus.current_round}/{liveStatus.total_rounds} </text>
        {liveStatus.agents.map((agent) => (
          <text
            key={agent.role}
            style={{
              fg: agent.status === "posted" ? theme.accent.green
                : agent.status === "thinking" ? theme.accent.yellow
                : agent.status === "error" ? theme.accent.red
                : theme.text.dim,
            }}
          >
            {getAgentSymbol(agent.role)}
          </text>
        ))}
        <text style={{ fg: theme.text.dim }}> {posted.toString()}/{total.toString()}</text>
      </box>

      {/* Latest event */}
      {liveStatus.latest_event && (
        <text style={{ fg: theme.text.muted, marginTop: 1 }}>
          {liveStatus.latest_event.substring(0, 38)}
        </text>
      )}

      {thinking > 0 && (
        <text style={{ fg: theme.text.dim }}>
          {liveStatus.agents
            .filter((a) => a.status === "thinking")
            .slice(0, 1)
            .map((a) => getRoleDisplayName(a.role, liveStatus.language))
            .join("")} {liveStatus.language === "zh" ? "正在思考..." : "is thinking..."}
        </text>
      )}

      {/* Hint */}
      <text style={{ fg: theme.text.dim, marginTop: 1 }}>
        {onExpand ? "[F2] to expand" : "Running in background"}
      </text>
    </box>
  );
};
