// src/tui-opentui/components/PresetPicker.tsx
import React, { useState } from "react";
// @ts-ignore OpenTUI uses different module resolution
import { useKeyboard } from "@opentui/react";
import type { PresetSummary } from "../../config/presets.js";

export type PresetPickerProps = {
  presets: PresetSummary[];
  onStart: (topic: string, presetId: string) => void;
  onCancel?: () => void;
};

export const PresetPicker: React.FC<PresetPickerProps> = ({
  presets,
  onStart,
  onCancel,
}) => {
  const [phase, setPhase] = useState<"topic" | "preset">("topic");
  const [topic, setTopic] = useState("");
  const [selectedPresetIdx, setSelectedPresetIdx] = useState(0);

  useKeyboard((key: { name: string; sequence?: string; ctrl?: boolean }) => {
    if (key.ctrl && key.name === "c") {
      onCancel?.();
      process.exit(0);
    }

    if (phase === "topic") {
      if (key.name === "return" && topic.trim()) {
        setPhase("preset");
      } else if (key.name === "backspace") {
        setTopic((prev) => prev.slice(0, -1));
      } else if (
        key.sequence &&
        key.sequence.length === 1 &&
        !key.name.startsWith("ctrl") &&
        !key.name.startsWith("meta")
      ) {
        setTopic((prev) => prev + key.sequence);
      }
    } else if (phase === "preset") {
      if (key.name === "up") {
        setSelectedPresetIdx((prev) => Math.max(0, prev - 1));
      } else if (key.name === "down") {
        setSelectedPresetIdx((prev) =>
          Math.min(presets.length - 1, prev + 1)
        );
      } else if (key.name === "return") {
        onStart(topic.trim(), presets[selectedPresetIdx].id);
      } else if (key.name === "escape") {
        setPhase("topic");
      }
    }
  });

  return (
    <box style={{ flexDirection: "column", padding: 2, width: "100%", height: "100%" }}>
      <text style={{ bold: true, color: "#7aa2f7", marginBottom: 1 }}>
        ⬡ AGORA — Multi-Agent Debate Launcher
      </text>

      {phase === "topic" && (
        <box style={{ flexDirection: "column" }}>
          <text style={{ color: "#c0caf5" }}>Enter debate topic or question:</text>
          <box
            style={{
              borderStyle: "single",
              borderColor: "#7aa2f7",
              marginTop: 1,
              padding: 1,
              width: "80%",
            }}
          >
            <text style={{ color: "#e0af68" }}>
              {topic}
              <text style={{ color: "#7aa2f7" }}>█</text>
            </text>
          </box>
          <text style={{ color: "#565f89", marginTop: 1 }}>
            Press Enter to continue · Ctrl+C to quit
          </text>
        </box>
      )}

      {phase === "preset" && (
        <box style={{ flexDirection: "column" }}>
          <text style={{ color: "#9ece6a", marginBottom: 1 }}>Topic: {topic}</text>
          <text style={{ color: "#c0caf5", marginBottom: 1 }}>Select debate format:</text>
          {presets.map((p, i) => (
            <box key={p.id} style={{ flexDirection: "row", marginBottom: 0 }}>
              <text
                style={{
                  color: i === selectedPresetIdx ? "#7aa2f7" : "#565f89",
                  width: 2,
                }}
              >
                {i === selectedPresetIdx ? "▶" : " "}
              </text>
              <box style={{ flexDirection: "column", marginLeft: 1 }}>
                <text
                  style={{
                    color: i === selectedPresetIdx ? "#e0af68" : "#c0caf5",
                    bold: i === selectedPresetIdx,
                  }}
                >
                  {p.id.padEnd(14)} — {p.name} ({p.agent_count} agents)
                </text>
                <text style={{ color: "#565f89" }}>  {p.description}</text>
              </box>
            </box>
          ))}
          <text style={{ color: "#565f89", marginTop: 1 }}>
            ↑↓ navigate · Enter to start · Esc to go back
          </text>
        </box>
      )}
    </box>
  );
};
