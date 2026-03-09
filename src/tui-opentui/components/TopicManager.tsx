import React, { useState, useEffect } from "react";
// @ts-ignore OpenTUI uses different module resolution
import { useKeyboard } from "@opentui/react";
import type { PresetSummary } from "../../config/presets.js";
import type { BlackboardStore } from "../../blackboard/store.js";

export type TopicManagerProps = {
  presets: PresetSummary[];
  store: BlackboardStore;
  onStart: (topic: string, presetId: string) => void;
  onResume: (topicId: string) => void;
  onCancel?: () => void;
};

export const TopicManager: React.FC<TopicManagerProps> = ({
  presets,
  store,
  onStart,
  onResume,
  onCancel,
}) => {
  const [phase, setPhase] = useState<"home" | "existing_topics" | "new_topic" | "preset">("home");
  const [topic, setTopic] = useState("");
  const [selectedPresetIdx, setSelectedPresetIdx] = useState(0);
  
  const [existingTopics, setExistingTopics] = useState<string[]>([]);
  const [selectedTopicIdx, setSelectedTopicIdx] = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (phase === "existing_topics") {
      store.listTopics().then(topics => setExistingTopics(topics));
    }
  }, [phase, store]);

  useKeyboard((key: { name: string; sequence?: string; ctrl?: boolean; shift?: boolean }) => {
    if (key.ctrl && key.name === "c") {
      onCancel?.();
      process.exit(0);
    }

    if (phase === "home") {
      if (key.name === "e") {
        setPhase("existing_topics");
        setSelectedTopicIdx(0);
        setShowDeleteConfirm(false);
      } else if (key.name === "n") {
        setPhase("new_topic");
      } else if (key.name === "q") {
        onCancel?.();
        process.exit(0);
      }
    } else if (phase === "existing_topics") {
      if (showDeleteConfirm) {
        if (key.name === "y") {
          const topicToDelete = existingTopics[selectedTopicIdx];
          if (topicToDelete) {
            store.deleteTopic(topicToDelete).then(() => {
              store.listTopics().then(topics => {
                setExistingTopics(topics);
                setSelectedTopicIdx(prev => Math.min(prev, Math.max(0, topics.length - 1)));
                setShowDeleteConfirm(false);
              });
            });
          }
        } else if (key.name === "n" || key.name === "escape") {
          setShowDeleteConfirm(false);
        }
      } else {
        if (key.name === "escape") {
          setPhase("home");
        } else if (key.name === "up") {
          setSelectedTopicIdx(prev => Math.max(0, prev - 1));
        } else if (key.name === "down") {
          setSelectedTopicIdx(prev => Math.min(existingTopics.length - 1, prev + 1));
        } else if (key.name === "d") {
          if (existingTopics.length > 0) {
            setShowDeleteConfirm(true);
          }
        } else if (key.name === "return") {
          if (existingTopics.length > 0) {
            onResume(existingTopics[selectedTopicIdx]);
          }
        }
      }
    } else if (phase === "new_topic") {
      if (key.name === "escape") {
        setPhase("home");
      } else if (key.name === "return" && topic.trim()) {
        setPhase("preset");
      } else if (key.name === "backspace") {
        setTopic(prev => prev.slice(0, -1));
      } else if (
        key.sequence &&
        key.sequence.length === 1 &&
        !key.name.startsWith("ctrl") &&
        !key.name.startsWith("meta")
      ) {
        setTopic(prev => prev + key.sequence);
      }
    } else if (phase === "preset") {
      if (key.name === "escape") {
        setPhase("new_topic");
      } else if (key.name === "up") {
        setSelectedPresetIdx(prev => Math.max(0, prev - 1));
      } else if (key.name === "down") {
        setSelectedPresetIdx(prev => Math.min(presets.length - 1, prev + 1));
      } else if (key.name === "return") {
        onStart(topic.trim(), presets[selectedPresetIdx].id);
      }
    }
  });

  return (
    <box style={{ flexDirection: "column", padding: 2, width: "100%", height: "100%" }}>
      <text style={{ bold: true, color: "#7aa2f7", marginBottom: 1 }}>
        ⬡ AGORA — Multi-Agent Debate Launcher
      </text>

      {phase === "home" && (
        <box style={{ flexDirection: "column" }}>
          <text style={{ color: "#c0caf5", marginBottom: 1 }}>Select an action:</text>
          <text style={{ color: "#e0af68" }}>[E] Enter existing topic</text>
          <text style={{ color: "#9ece6a" }}>[N] Create new topic</text>
          <text style={{ color: "#f7768e" }}>[Q] Quit</text>
        </box>
      )}

      {phase === "existing_topics" && (
        <box style={{ flexDirection: "column" }}>
          <text style={{ color: "#c0caf5", marginBottom: 1 }}>Select an existing topic:</text>
          {existingTopics.length === 0 ? (
            <text style={{ color: "#565f89" }}>No existing topics found.</text>
          ) : (
            existingTopics.map((t, i) => (
              <box key={t} style={{ flexDirection: "row" }}>
                <text style={{ color: i === selectedTopicIdx ? "#7aa2f7" : "#565f89", width: 2 }}>
                  {i === selectedTopicIdx ? "▶" : " "}
                </text>
                <text style={{ color: i === selectedTopicIdx ? "#e0af68" : "#c0caf5" }}>
                  {t}
                </text>
              </box>
            ))
          )}
          {showDeleteConfirm && (
            <box style={{ flexDirection: "column", marginTop: 1, borderStyle: "single", borderColor: "#f7768e", padding: 1 }}>
              <text style={{ color: "#f7768e", bold: true }}>
                Delete topic "{existingTopics[selectedTopicIdx]}"?
              </text>
              <text style={{ color: "#c0caf5" }}>[Y]es / [N]o</text>
            </box>
          )}
          <text style={{ color: "#565f89", marginTop: 1 }}>
            ↑↓ navigate · Enter to resume · [D] delete · Esc to go back
          </text>
        </box>
      )}

      {phase === "new_topic" && (
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
            Press Enter to continue · Esc to go back · Ctrl+C to quit
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
