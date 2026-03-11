import React, { useState, useEffect } from "react";
// @ts-ignore OpenTUI uses different module resolution
import { useKeyboard } from "@opentui/react";
import type { AvailableModel } from "../../config/opencode-loader.js";
import { loadRoles, type RoleCatalog } from "../../config/presets.js";
import { theme, getAgentColor, getAgentSymbol } from "../theme.js";
import { detectLanguage } from "../../utils/language-detect.js";
import { getLocalizedPersona, getRoleDisplayName } from "../../utils/role-localization.js";

export type WizardAgent = {
  role: string;
  model: string;
  persona: string;
};

export type TopicWizardProps = {
  availableModels: AvailableModel[];
  agoraDir: string;
  onComplete: (config: {
    question: string;
    agentCount: number;
    agents: WizardAgent[];
  }) => void;
  onCancel: () => void;
};

type WizardStep =
  | "question"
  | "agent_count"
  | "agent_config"
  | "persona_edit"
  | "confirm";

export const TopicWizard: React.FC<TopicWizardProps> = ({
  availableModels,
  agoraDir,
  onComplete,
  onCancel,
}) => {
  const [step, setStep] = useState<WizardStep>("question");
  const [question, setQuestion] = useState("");
  const [agentCount, setAgentCount] = useState(3);
  const [agents, setAgents] = useState<WizardAgent[]>([]);
  const [roles, setRoles] = useState<RoleCatalog>({});

  // Per-agent config state
  const [currentAgentIdx, setCurrentAgentIdx] = useState(0);
  const [roleSelectIdx, setRoleSelectIdx] = useState(0);
  const [modelSelectIdx, setModelSelectIdx] = useState(0);
  const [configSubstep, setConfigSubstep] = useState<"role" | "model">("role");

  // Persona edit state
  const [editingAgentIdx, setEditingAgentIdx] = useState(0);
  const [editingPersona, setEditingPersona] = useState("");

  // Load roles from .agora/roles.json
  useEffect(() => {
    loadRoles(agoraDir).then(setRoles);
  }, [agoraDir]);

  const roleNames = Object.keys(roles);
  const defaultModel = availableModels.length > 0 ? availableModels[0].id : "lilith/deepseek-v3-2-251201";
  const questionLanguage = detectLanguage(question);

  const getDefaultPersona = (roleName: string): string => {
    const roleEntry = roles[roleName];
    return getLocalizedPersona(
      roleName,
      questionLanguage,
      roleEntry?.persona || `You are debating as the "${roleName}" perspective.`,
    );
  };

  useKeyboard((key: { name: string; sequence?: string; ctrl?: boolean; shift?: boolean }) => {
    if (key.ctrl && key.name === "c") {
      onCancel();
      return;
    }

    if (step === "question") {
      if (key.name === "escape") {
        onCancel();
      } else if (key.name === "return" && question.trim()) {
        setStep("agent_count");
      } else if (key.name === "backspace") {
        setQuestion(prev => prev.slice(0, -1));
      } else if (
        key.sequence &&
        key.sequence.length === 1 &&
        !key.name.startsWith("ctrl") &&
        !key.name.startsWith("meta")
      ) {
        setQuestion(prev => prev + key.sequence);
      }
    } else if (step === "agent_count") {
      if (key.name === "escape") {
        setStep("question");
      } else if (key.name === "up" || key.name === "right") {
        setAgentCount(prev => Math.min(8, prev + 1));
      } else if (key.name === "down" || key.name === "left") {
        setAgentCount(prev => Math.max(2, prev - 1));
      } else if (key.name === "return") {
        // Initialize agents array with defaults
        const initial: WizardAgent[] = [];
        for (let i = 0; i < agentCount; i++) {
          const roleName = roleNames[i % roleNames.length] || `agent-${i + 1}`;
          const roleEntry = roles[roleName];
          initial.push({
            role: roleName,
            model: roleEntry?.default_model || defaultModel,
            persona: getDefaultPersona(roleName),
          });
        }
        setAgents(initial);
        setCurrentAgentIdx(0);
        setRoleSelectIdx(0);
        setModelSelectIdx(0);
        setConfigSubstep("role");
        setStep("agent_config");
      }
    } else if (step === "agent_config") {
      if (key.name === "escape") {
        if (configSubstep === "model") {
          setConfigSubstep("role");
        } else if (currentAgentIdx > 0) {
          setCurrentAgentIdx(prev => prev - 1);
          setConfigSubstep("model");
        } else {
          setStep("agent_count");
        }
      } else if (configSubstep === "role") {
        if (key.name === "up") {
          setRoleSelectIdx(prev => Math.max(0, prev - 1));
        } else if (key.name === "down") {
          setRoleSelectIdx(prev => Math.min(roleNames.length - 1, prev + 1));
        } else if (key.name === "return" && roleNames.length > 0) {
          const selectedRole = roleNames[roleSelectIdx];
          const roleEntry = roles[selectedRole];
          const updated = [...agents];
          updated[currentAgentIdx] = {
            ...updated[currentAgentIdx],
            role: selectedRole,
            persona: getDefaultPersona(selectedRole),
            model: roleEntry?.default_model || updated[currentAgentIdx].model,
          };
          setAgents(updated);
          // Find the current model in the available models list
          const currentModel = updated[currentAgentIdx].model;
          const modelIdx = availableModels.findIndex(m => m.id === currentModel);
          setModelSelectIdx(modelIdx >= 0 ? modelIdx : 0);
          setConfigSubstep("model");
        }
      } else if (configSubstep === "model") {
        if (key.name === "up") {
          setModelSelectIdx(prev => Math.max(0, prev - 1));
        } else if (key.name === "down") {
          setModelSelectIdx(prev => Math.min(availableModels.length - 1, prev + 1));
        } else if (key.name === "return" && availableModels.length > 0) {
          const selectedModel = availableModels[modelSelectIdx];
          const updated = [...agents];
          updated[currentAgentIdx] = {
            ...updated[currentAgentIdx],
            model: selectedModel.id,
          };
          setAgents(updated);

          // Move to next agent or to persona edit
          if (currentAgentIdx < agentCount - 1) {
            setCurrentAgentIdx(prev => prev + 1);
            setRoleSelectIdx(0);
            setConfigSubstep("role");
          } else {
            // All agents configured — move to persona edit
            setEditingAgentIdx(0);
            setEditingPersona(updated[0].persona);
            setStep("persona_edit");
          }
        }
      }
    } else if (step === "persona_edit") {
      if (key.name === "escape") {
        if (editingAgentIdx > 0) {
          // Go back to previous agent
          const prevIdx = editingAgentIdx - 1;
          setEditingAgentIdx(prevIdx);
          setEditingPersona(agents[prevIdx].persona);
        } else {
          setStep("agent_config");
          setCurrentAgentIdx(agentCount - 1);
          setConfigSubstep("model");
        }
      } else if (key.name === "return") {
        // Save persona and advance
        const updated = [...agents];
        updated[editingAgentIdx] = {
          ...updated[editingAgentIdx],
          persona: editingPersona,
        };
        setAgents(updated);

        if (editingAgentIdx < agentCount - 1) {
          const nextIdx = editingAgentIdx + 1;
          setEditingAgentIdx(nextIdx);
          setEditingPersona(updated[nextIdx].persona);
        } else {
          setStep("confirm");
        }
      } else if (key.name === "tab") {
        // Skip persona editing — keep default, advance
        if (editingAgentIdx < agentCount - 1) {
          const nextIdx = editingAgentIdx + 1;
          setEditingAgentIdx(nextIdx);
          setEditingPersona(agents[nextIdx].persona);
        } else {
          setStep("confirm");
        }
      } else if (key.name === "backspace") {
        setEditingPersona(prev => prev.slice(0, -1));
      } else if (
        key.sequence &&
        key.sequence.length === 1 &&
        !key.name.startsWith("ctrl") &&
        !key.name.startsWith("meta")
      ) {
        setEditingPersona(prev => prev + key.sequence);
      }
    } else if (step === "confirm") {
      if (key.name === "escape") {
        setEditingAgentIdx(agentCount - 1);
        setEditingPersona(agents[agentCount - 1].persona);
        setStep("persona_edit");
      } else if (key.name === "return") {
        onComplete({ question, agentCount, agents });
      }
    }
  });

  // ─── Step indicators ──────────────────────────────────────────────────

  const steps: Array<{ label: string; key: WizardStep }> = [
    { label: "Question", key: "question" },
    { label: "Agents", key: "agent_count" },
    { label: "Configure", key: "agent_config" },
    { label: "Personas", key: "persona_edit" },
    { label: "Confirm", key: "confirm" },
  ];

  const stepIndex = steps.findIndex(s => s.key === step);

  const stepIndicator = (
    <box style={{ flexDirection: "row", marginBottom: 1 }}>
      {steps.map((s, i) => (
        <text
          key={s.key}
          style={{
            fg: i === stepIndex ? theme.accent.blue : i < stepIndex ? theme.accent.green : theme.text.dim,
            bold: i === stepIndex,
          }}
        >
          {i === stepIndex ? "●" : i < stepIndex ? "✓" : "○"} {s.label}
          {i < steps.length - 1 ? " → " : ""}
        </text>
      ))}
    </box>
  );

  // ─── Render steps ────────────────────────────────────────────────────

  return (
    <box style={{ flexDirection: "column", padding: 2, width: "100%", height: "100%" }}>
      <text style={{ bold: true, fg: theme.accent.blue, marginBottom: 1 }}>
        ⬡ AGORA — Topic Wizard
      </text>
      {stepIndicator}

      {/* Step 1: Question */}
      {step === "question" && (
        <box style={{ flexDirection: "column" }}>
          <text style={{ fg: theme.text.primary }}>What should the agents debate?</text>
          <box
            style={{
              borderStyle: "single",
              borderColor: theme.accent.blue,
              marginTop: 1,
              padding: 1,
              width: "80%",
              flexDirection: "row",
            }}
          >
            <text style={{ fg: theme.accent.yellow }}>{question}</text>
            <text style={{ fg: theme.accent.blue }}>█</text>
          </box>
          <text style={{ fg: theme.text.dim, marginTop: 1 }}>
            Enter to continue · Esc to cancel
          </text>
        </box>
      )}

      {/* Step 2: Agent Count */}
      {step === "agent_count" && (
        <box style={{ flexDirection: "column" }}>
          <text style={{ fg: theme.text.primary, marginBottom: 1 }}>
            How many discussion agents? (2-8)
          </text>
          <box style={{ flexDirection: "row", alignItems: "center" }}>
            <text style={{ fg: theme.text.dim }}>2 </text>
            {Array.from({ length: 7 }, (_, i) => i + 2).map(n => (
              <text
                key={n.toString()}
                style={{
                  fg: n === agentCount ? theme.accent.blue : n < agentCount ? theme.accent.green : theme.text.dim,
                  bold: n === agentCount,
                }}
              >
                {n === agentCount ? `[${n.toString()}]` : " · "}
              </text>
            ))}
            <text style={{ fg: theme.text.dim }}> 8</text>
          </box>
          <text style={{ fg: theme.text.dim, marginTop: 1 }}>
            ←→ or ↑↓ to adjust · Enter to continue · Esc to go back
          </text>
        </box>
      )}

      {/* Step 3: Agent Config (role + model per agent) */}
      {step === "agent_config" && (
        <box style={{ flexDirection: "column" }}>
          <text style={{ fg: theme.text.primary, marginBottom: 1 }}>
            Agent {(currentAgentIdx + 1).toString()}/{agentCount.toString()} — {configSubstep === "role" ? "Select Role" : "Select Model"}
          </text>

          {/* Show already-configured agents */}
          {agents.slice(0, currentAgentIdx).map((a, i) => (
            <text key={i.toString()} style={{ fg: theme.text.dim }}>
              {getAgentSymbol(a.role)} Agent {(i + 1).toString()}: {getRoleDisplayName(a.role, questionLanguage)} → {a.model}
            </text>
          ))}

          {configSubstep === "role" && (
            <box style={{ flexDirection: "column", marginTop: 1 }}>
              <text style={{ fg: theme.accent.yellow, marginBottom: 1 }}>Choose role:</text>
              <box style={{ flexDirection: "column" }}>
                {roleNames.map((name, i) => (
                  <text
                    key={name}
                    style={{
                      fg: i === roleSelectIdx ? theme.accent.blue : theme.text.primary,
                      bold: i === roleSelectIdx,
                    }}
                  >
                    {i === roleSelectIdx ? "▶ " : "  "}
                    {getAgentSymbol(name)} {getRoleDisplayName(name, questionLanguage)}
                  </text>
                ))}
              </box>
            </box>
          )}

          {configSubstep === "model" && (
            <box style={{ flexDirection: "column", marginTop: 1 }}>
              <text style={{ fg: theme.accent.yellow, marginBottom: 1 }}>
                Choose model for {getAgentSymbol(agents[currentAgentIdx]?.role)} {getRoleDisplayName(agents[currentAgentIdx]?.role, questionLanguage)}:
              </text>
              <box style={{ flexDirection: "column" }}>
                {availableModels.map((m, i) => (
                  <text
                    key={m.id}
                    style={{
                      fg: i === modelSelectIdx ? theme.accent.blue : theme.text.primary,
                      bold: i === modelSelectIdx,
                    }}
                  >
                    {i === modelSelectIdx ? "▶ " : "  "}
                    {m.name} ({m.id})
                  </text>
                ))}
              </box>
            </box>
          )}

          <text style={{ fg: theme.text.dim, marginTop: 1 }}>
            ↑↓ navigate · Enter to select · Esc to go back
          </text>
        </box>
      )}

      {/* Step 4: Persona Edit */}
      {step === "persona_edit" && (
        <box style={{ flexDirection: "column" }}>
          <text style={{ fg: theme.text.primary, marginBottom: 1 }}>
            Edit persona for {getAgentSymbol(agents[editingAgentIdx]?.role)}{" "}
            {getRoleDisplayName(agents[editingAgentIdx]?.role, questionLanguage)} ({(editingAgentIdx + 1).toString()}/{agentCount.toString()})
          </text>
          <text style={{ fg: theme.text.dim }}>
            Model: {agents[editingAgentIdx]?.model}
          </text>
          <box
            style={{
              borderStyle: "single",
              borderColor: getAgentColor(agents[editingAgentIdx]?.role),
              marginTop: 1,
              padding: 1,
              width: "90%",
              height: 6,
              flexDirection: "row",
            }}
          >
            <text style={{ fg: theme.text.primary }}>{editingPersona.substring(editingPersona.length - 300)}</text>
            <text style={{ fg: theme.accent.blue }}>█</text>
          </box>
          <text style={{ fg: theme.text.dim, marginTop: 1 }}>
            Enter to save & next · Tab to skip (keep default) · Esc to go back
          </text>
        </box>
      )}

      {/* Step 5: Confirm */}
      {step === "confirm" && (
        <box style={{ flexDirection: "column" }}>
          <text style={{ fg: theme.accent.green, bold: true, marginBottom: 1 }}>
            Review & Launch
          </text>
          <text style={{ fg: theme.text.primary }}>Question: {question}</text>
          <text style={{ fg: theme.text.dim, marginTop: 1, marginBottom: 1 }}>
            Agents ({agentCount.toString()}):
          </text>
          {agents.map((a, i) => (
            <box key={i.toString()} style={{ flexDirection: "column", marginBottom: 1 }}>
              <text style={{ fg: getAgentColor(a.role), bold: true }}>
                {getAgentSymbol(a.role)} {getRoleDisplayName(a.role, questionLanguage)}
              </text>
              <text style={{ fg: theme.text.dim }}>  Model: {a.model}</text>
              <text style={{ fg: theme.text.muted }}>
                {"  "}
                {a.persona.substring(0, 80)}
                {a.persona.length > 80 ? "..." : ""}
              </text>
            </box>
          ))}
          <box
            style={{
              borderStyle: "double",
              borderColor: theme.accent.green,
              marginTop: 1,
              padding: 1,
              width: 40,
            }}
          >
            <text style={{ fg: theme.accent.green, bold: true }}>
              Press Enter to start debate
            </text>
          </box>
          <text style={{ fg: theme.text.dim, marginTop: 1 }}>
            Esc to go back and edit
          </text>
        </box>
      )}
    </box>
  );
};
