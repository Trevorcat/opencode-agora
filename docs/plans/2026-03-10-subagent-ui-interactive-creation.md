# Subagent-Style UI & Interactive Topic Creation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a subagent-style floating window for running debates and a step-by-step interactive wizard for creating new topics with per-agent model selection and persona editing, all within the existing OpenTUI-based terminal UI.

**Architecture:** Extends the existing TUI (`src/tui-opentui/`) with two new capabilities: (1) A `TopicWizard` component that replaces the current flat `TopicManager` with a multi-step questionnaire (agent count → model selection → persona editing → confirm), and (2) A `SubagentCard` floating overlay that appears when a debate starts, showing compact progress and expanding into the full debate view on interaction. The existing `AppMode` state machine in `App.tsx` gains new states (`'wizard'` and `'launching'`) to handle transitions. No MCP server changes needed — all new functionality is TUI-side, calling the existing `DebateController` and `BlackboardStore` directly.

**Tech Stack:** TypeScript, React 19, @opentui/core + @opentui/react (Bun), existing theme system

**Existing Conventions:**
- Components are in `src/tui-opentui/components/*.tsx`
- All use `// @ts-ignore` for OpenTUI React imports
- Theme colors from `src/tui-opentui/theme.ts` (use `theme.accent.*`, `theme.text.*`, `theme.bg.*`)
- Keyboard handling via `useKeyboard` hook from `@opentui/react`
- Mouse events via `onMouseDown`, `onMouseOver`, `onMouseOut`, `onMouseScroll` (all `@ts-ignore`)
- State styling: `borderStyle: 'single' | 'double' | 'rounded' | 'bold'`
- Export components from `src/tui-opentui/components/index.ts`
- Props use explicit type aliases (not inline), e.g. `export type FooProps = { ... }`

---

## Task 1: Extend `AppMode` State Machine

**Files:**
- Modify: `src/tui-opentui/App.tsx`

Add the new wizard and launching states to the `AppMode` type so downstream tasks can reference them.

### Step 1: Update the `AppMode` type definition

In `src/tui-opentui/App.tsx`, replace:

```typescript
export type AppMode = 
  | { kind: 'picker' }
  | { kind: 'debate'; topicId: string };
```

With:

```typescript
export type WizardConfig = {
  question: string;
  agentCount: number;
  agents: Array<{
    role: string;
    model: string;
    persona: string;
  }>;
};

export type AppMode = 
  | { kind: 'picker' }
  | { kind: 'wizard' }
  | { kind: 'launching'; config: WizardConfig }
  | { kind: 'debate'; topicId: string };
```

### Step 2: Update the mode initializer

The `useState<AppMode>` call already handles `picker` vs `debate`. No change needed — wizard is entered from picker.

### Step 3: Add wizard/launching mode handling in the render

In the `App` component, after the existing `if (mode.kind === 'picker')` block (line 175), and before the debate mode rendering, add placeholder handling:

```typescript
// Show wizard mode
if (mode.kind === 'wizard') {
  return (
    <TopicWizard
      availableModels={availableModels}
      agoraDir={agoraDir}
      onComplete={(config) => {
        setMode({ kind: 'launching', config });
      }}
      onCancel={() => setMode({ kind: 'picker' })}
    />
  );
}

// Show launching state
if (mode.kind === 'launching') {
  return (
    <box style={{ flexDirection: 'column', padding: 2, justifyContent: 'center', alignItems: 'center' }}>
      <text style={{ fg: theme.accent.blue, bold: true }}>Starting debate...</text>
      <text style={{ fg: theme.text.dim }}>Preparing {mode.config.agentCount} agents</text>
    </box>
  );
}
```

### Step 4: Update the TopicManager `onStart` callback to route through wizard

In the existing `TopicManager` render block (lines 176-202), add a new button for the wizard flow. Update the home phase of `TopicManager` or, alternatively, add an "Advanced" option that routes to wizard mode:

Update the `onStart` callback usage in the picker block — when "New topic" is chosen from `TopicManager`, route to `wizard` instead:

Replace the `TopicManager` render in the picker block:

```typescript
if (mode.kind === 'picker') {
  return (
    <TopicManager
      presets={presets}
      store={store}
      onStart={(newTopic, presetId) => {
        const startDebate = async () => {
          try {
            const agents = await resolvePreset(agoraDir, presetId);
            const newTopicId = `topic-${Date.now()}`;
            controller.runDebateAsync({
              topicId: newTopicId,
              question: newTopic,
              agents,
            });
            setMode({ kind: 'debate', topicId: newTopicId });
          } catch (err) {
            console.error('Failed to start debate:', err);
          }
        };
        startDebate();
      }}
      onResume={(resumeTopicId) => {
        setMode({ kind: 'debate', topicId: resumeTopicId });
      }}
      onWizard={() => setMode({ kind: 'wizard' })}
      onCancel={() => process.exit(0)}
    />
  );
}
```

### Step 5: Update `TopicManager` props to accept `onWizard`

In `src/tui-opentui/components/TopicManager.tsx`, add `onWizard` to the props type:

```typescript
export type TopicManagerProps = {
  presets: PresetSummary[];
  store: BlackboardStore;
  onStart: (topic: string, presetId: string) => void;
  onResume: (topicId: string) => void;
  onWizard?: () => void;
  onCancel?: () => void;
};
```

Add `onWizard` to the destructured props and add a `[W]` key handler in the `"home"` phase keyboard handler:

In the home phase keyboard block (around line 43-53), add:

```typescript
} else if (key.name === 'w' && onWizard) {
  onWizard();
}
```

In the home phase render (around line 121-128), add the wizard option:

```tsx
<text style={{ fg: theme.accent.mauve }}>[W] Wizard: custom agent setup</text>
```

### Step 6: Add import for TopicWizard in App.tsx

Add to imports at top of `App.tsx`:

```typescript
import { TopicWizard } from './components/TopicWizard.js';
```

Note: `TopicWizard` component doesn't exist yet — it will be created in Task 2. The build will have a type error until Task 2 is complete.

### Step 7: Verify build compiles (will fail until Task 2)

```bash
npx tsc --noEmit 2>&1 | head -5
```

Expected: Error about missing `TopicWizard` module. This is fine — Task 2 creates it.

### Step 8: Commit (do NOT commit yet — wait for Task 2 to avoid broken build)

Will commit together with Task 2.

---

## Task 2: `TopicWizard` Component — Multi-Step Questionnaire

**Files:**
- Create: `src/tui-opentui/components/TopicWizard.tsx`
- Modify: `src/tui-opentui/components/index.ts`

A 4-step wizard:
1. Enter question text
2. Select agent count (2-8 via slider)
3. For each agent: select role from `roles.json`, pick model from `availableModels`
4. Review & edit personas, confirm

### Step 1: Create the `TopicWizard` component

Create `src/tui-opentui/components/TopicWizard.tsx`:

```tsx
import React, { useState, useEffect } from "react";
// @ts-ignore OpenTUI uses different module resolution
import { useKeyboard } from "@opentui/react";
import type { AvailableModel } from "../../config/opencode-loader.js";
import { loadRoles, type RoleCatalog } from "../../config/presets.js";
import { theme, getAgentColor, getAgentSymbol } from "../theme.js";

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
            persona: roleEntry?.persona || `You are debating as the "${roleName}" perspective.`,
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
            persona: roleEntry?.persona || `You are debating as the "${selectedRole}" perspective.`,
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
            }}
          >
            <text style={{ fg: theme.accent.yellow }}>
              {question}
              <text style={{ fg: theme.accent.blue }}>█</text>
            </text>
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
                key={n}
                style={{
                  fg: n === agentCount ? theme.accent.blue : n < agentCount ? theme.accent.green : theme.text.dim,
                  bold: n === agentCount,
                }}
              >
                {n === agentCount ? `[${n}]` : " · "}
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
            Agent {currentAgentIdx + 1}/{agentCount} — {configSubstep === "role" ? "Select Role" : "Select Model"}
          </text>

          {/* Show already-configured agents */}
          {agents.slice(0, currentAgentIdx).map((a, i) => (
            <text key={i} style={{ fg: theme.text.dim }}>
              {getAgentSymbol(a.role)} Agent {i + 1}: {a.role} → {a.model}
            </text>
          ))}

          {configSubstep === "role" && (
            <box style={{ flexDirection: "column", marginTop: 1 }}>
              <text style={{ fg: theme.accent.yellow, marginBottom: 1 }}>Choose role:</text>
              <scrollbox style={{ maxHeight: 8, scrollY: true }}>
                {roleNames.map((name, i) => (
                  <text
                    key={name}
                    style={{
                      fg: i === roleSelectIdx ? theme.accent.blue : theme.text.primary,
                      bold: i === roleSelectIdx,
                    }}
                  >
                    {i === roleSelectIdx ? "▶ " : "  "}
                    {getAgentSymbol(name)} {name}
                  </text>
                ))}
              </scrollbox>
            </box>
          )}

          {configSubstep === "model" && (
            <box style={{ flexDirection: "column", marginTop: 1 }}>
              <text style={{ fg: theme.accent.yellow, marginBottom: 1 }}>
                Choose model for {getAgentSymbol(agents[currentAgentIdx]?.role)} {agents[currentAgentIdx]?.role}:
              </text>
              <scrollbox style={{ maxHeight: 8, scrollY: true }}>
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
              </scrollbox>
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
            {agents[editingAgentIdx]?.role} ({editingAgentIdx + 1}/{agentCount})
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
            }}
          >
            <text style={{ fg: theme.text.primary }}>
              {editingPersona.substring(editingPersona.length - 300)}
              <text style={{ fg: theme.accent.blue }}>█</text>
            </text>
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
            Agents ({agentCount}):
          </text>
          {agents.map((a, i) => (
            <box key={i} style={{ flexDirection: "column", marginBottom: 1 }}>
              <text style={{ fg: getAgentColor(a.role), bold: true }}>
                {getAgentSymbol(a.role)} {a.role}
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
```

### Step 2: Export `TopicWizard` from the components barrel

In `src/tui-opentui/components/index.ts`, add:

```typescript
export { TopicWizard } from './TopicWizard.js';
```

### Step 3: Verify TypeScript compiles

```bash
npx tsc --noEmit
```

Expected: Clean compile (assuming Task 1 is done).

### Step 4: Manual test

```bash
npm run build && npm run tui
```

- From home screen, press `W` to enter wizard
- Type a question, Enter
- Adjust agent count with arrows, Enter
- Select roles and models for each agent
- Edit personas or Tab to skip
- Confirm screen shows summary, Enter launches

### Step 5: Commit Tasks 1 + 2 together

```bash
git add src/tui-opentui/App.tsx src/tui-opentui/components/TopicManager.tsx src/tui-opentui/components/TopicWizard.tsx src/tui-opentui/components/index.ts
git commit -m "feat: add TopicWizard multi-step questionnaire for interactive topic creation"
```

---

## Task 3: Wire Wizard Completion to Debate Launch

**Files:**
- Modify: `src/tui-opentui/App.tsx`

When the wizard completes, use `DebateController.runDebateAsync()` to start the debate and transition to the debate view.

### Step 1: Handle the `'launching'` state transition

In `App.tsx`, add an `useEffect` that triggers when mode changes to `'launching'`:

```typescript
// Add after the existing useEffect blocks (around line 92)

// Launch debate when wizard completes
useEffect(() => {
  if (mode.kind !== 'launching') return;

  const launchDebate = async () => {
    try {
      const { config } = mode;
      const newTopicId = `topic-${Date.now()}`;

      // Save topic metadata
      await store.saveTopic({
        id: newTopicId,
        question: config.question,
        status: 'pending',
        config: {
          max_rounds: 3,
          consensus_threshold: 0.66,
          agents: config.agents.map(a => ({
            role: a.role,
            model: a.model,
            persona: a.persona,
          })),
        },
        created_at: new Date().toISOString(),
      });

      // Start async debate
      controller.runDebateAsync({
        topicId: newTopicId,
        question: config.question,
        agents: config.agents.map(a => ({
          role: a.role,
          model: a.model,
          persona: a.persona,
        })),
      });

      setMode({ kind: 'debate', topicId: newTopicId });
    } catch (err) {
      console.error('Failed to launch debate:', err);
      setError(err instanceof Error ? err.message : String(err));
      setMode({ kind: 'picker' });
    }
  };

  launchDebate();
}, [mode.kind]); // eslint-disable-line react-hooks/exhaustive-deps
```

### Step 2: Verify end-to-end flow

```bash
npm run build && npm run tui
```

1. Press `W`, enter question, configure agents, confirm
2. Should transition to launching → debate view
3. Debate should start running with configured agents

### Step 3: Commit

```bash
git add src/tui-opentui/App.tsx
git commit -m "feat: wire wizard completion to debate launch via DebateController"
```

---

## Task 4: `SubagentCard` Floating Overlay Component

**Files:**
- Create: `src/tui-opentui/components/SubagentCard.tsx`
- Modify: `src/tui-opentui/components/index.ts`

A compact floating card that shows when a debate is running, similar to OpenCode's subagent UI. Shows topic, status, round progress, and agent activity in a small overlay. Click or press a key to expand into the full debate view.

### Step 1: Create the `SubagentCard` component

Create `src/tui-opentui/components/SubagentCard.tsx`:

```tsx
import React, { useState, useEffect } from "react";
import type { LiveStatus } from "../../blackboard/types.js";
import { theme, getAgentColor, getAgentSymbol } from "../theme.js";

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

  // Spinner animation
  useEffect(() => {
    if (!liveStatus || liveStatus.status === "completed" || liveStatus.status === "failed") return;
    const interval = setInterval(() => {
      setFrame(f => (f + 1) % 10);
    }, 80);
    return () => clearInterval(interval);
  }, [liveStatus?.status]);

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
        // @ts-ignore OpenTUI mouse event
        onMouseDown={() => onExpand?.()}
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

  const truncatedQuestion = liveStatus.topic_id.length > 30
    ? liveStatus.topic_id.substring(0, 27) + "..."
    : liveStatus.topic_id;

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
      // @ts-ignore OpenTUI mouse event
      onMouseDown={() => onExpand?.()}
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
        {liveStatus.agents.map((agent, i) => (
          <text
            key={i}
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
        <text style={{ fg: theme.text.dim }}> {posted}/{total}</text>
      </box>

      {/* Latest event */}
      {liveStatus.latest_event && (
        <text style={{ fg: theme.text.muted, marginTop: 1 }}>
          {liveStatus.latest_event.substring(0, 38)}
        </text>
      )}

      {/* Hint */}
      <text style={{ fg: theme.text.dim, marginTop: 1 }}>
        Click or [F2] to expand
      </text>
    </box>
  );
};
```

### Step 2: Export from barrel

In `src/tui-opentui/components/index.ts`, add:

```typescript
export { SubagentCard } from './SubagentCard.js';
```

### Step 3: Verify build

```bash
npx tsc --noEmit
```

Expected: Clean compile.

### Step 4: Commit

```bash
git add src/tui-opentui/components/SubagentCard.tsx src/tui-opentui/components/index.ts
git commit -m "feat: add SubagentCard floating overlay component for compact debate monitoring"
```

---

## Task 5: Integrate `SubagentCard` into App with Toggle Behavior

**Files:**
- Modify: `src/tui-opentui/App.tsx`

Add the `SubagentCard` as a floating overlay when a debate is running. Add F2 key toggle between compact card view and full debate view. The card appears in a corner of the screen and can be expanded into the full three-panel debate layout.

### Step 1: Add collapsed state and F2 toggle

In `App.tsx`, add a new state variable:

```typescript
const [debateCollapsed, setDebateCollapsed] = useState(false);
```

### Step 2: Add F2 key handler

In the existing keyboard handler (around line 95), add to the normal mode section:

```typescript
} else if (key.name === 'f2') {
  setDebateCollapsed(prev => !prev);
}
```

### Step 3: Add SubagentCard import

```typescript
import { SubagentCard } from './components/SubagentCard.js';
```

### Step 4: Render SubagentCard when collapsed

In the debate mode rendering section, wrap the existing full debate layout in a condition:

```typescript
// Before the existing debate mode JSX (around line 230):

if (mode.kind === 'debate' && debateCollapsed) {
  return (
    <box style={{ width: '100%', height: '100%' }}>
      <SubagentCard
        topicId={topicId}
        liveStatus={liveStatus}
        floating={false}
        onExpand={() => setDebateCollapsed(false)}
      />
      <box style={{ padding: 2 }}>
        <text style={{ fg: theme.text.dim }}>
          Debate running in background. Press F2 to expand.
        </text>
      </box>
    </box>
  );
}
```

### Step 5: Reset collapsed state on mode change

Add to the existing useEffect or add a new one:

```typescript
useEffect(() => {
  setDebateCollapsed(false);
}, [mode.kind]);
```

### Step 6: Manual test

```bash
npm run build && npm run tui
```

1. Start a debate (via preset picker or wizard)
2. Press F2 — should collapse to compact SubagentCard
3. Press F2 again or click — should expand back to full view
4. Card should show live status updates (round, agent symbols, latest event)

### Step 7: Commit

```bash
git add src/tui-opentui/App.tsx
git commit -m "feat: integrate SubagentCard with F2 toggle between compact and full debate view"
```

---

## Task 6: Overlay Card for Multi-Topic Mode (Background Debates)

**Files:**
- Modify: `src/tui-opentui/App.tsx`

When a debate completes and the user returns to the picker to start another, show a floating SubagentCard for any running debates in the background. This gives the "subagent window" feel where you can see multiple debates at a glance.

### Step 1: Track background topics

Add state to track background topic IDs:

```typescript
const [backgroundTopics, setBackgroundTopics] = useState<string[]>([]);
const [backgroundStatuses, setBackgroundStatuses] = useState<Map<string, LiveStatus | null>>(new Map());
```

### Step 2: Add "minimize to background" behavior

When the user presses Escape from the debate view (while it's still running), minimize to background and return to picker:

In the keyboard handler, update the `'escape'` case in debate mode:

```typescript
} else if (key.name === 'escape' && mode.kind === 'debate') {
  // If debate is still running, minimize to background
  if (liveStatus && liveStatus.status !== 'completed' && liveStatus.status !== 'failed') {
    setBackgroundTopics(prev => [...prev.filter(id => id !== topicId), topicId]);
    setMode({ kind: 'picker' });
  }
}
```

### Step 3: Poll background topic statuses

Add a useEffect to poll background topics:

```typescript
useEffect(() => {
  if (backgroundTopics.length === 0) return;

  const poll = async () => {
    const newStatuses = new Map<string, LiveStatus | null>();
    for (const bgTopicId of backgroundTopics) {
      try {
        const status = await store.getLiveStatus(bgTopicId);
        newStatuses.set(bgTopicId, status);
      } catch {
        newStatuses.set(bgTopicId, null);
      }
    }
    setBackgroundStatuses(newStatuses);

    // Remove completed/failed topics from background after showing for a bit
    // (keep them so user can see the result)
  };

  poll();
  const interval = setInterval(poll, 2000);
  return () => clearInterval(interval);
}, [backgroundTopics, store]);
```

### Step 4: Render floating cards in picker mode

In the picker mode render, add floating SubagentCards:

```typescript
if (mode.kind === 'picker') {
  return (
    <box style={{ width: '100%', height: '100%' }}>
      <TopicManager
        presets={presets}
        store={store}
        onStart={/* existing */}
        onResume={(resumeTopicId) => {
          // Remove from background if it was there
          setBackgroundTopics(prev => prev.filter(id => id !== resumeTopicId));
          setMode({ kind: 'debate', topicId: resumeTopicId });
        }}
        onWizard={() => setMode({ kind: 'wizard' })}
        onCancel={() => process.exit(0)}
      />

      {/* Background debate cards */}
      {backgroundTopics.map((bgTopicId, i) => (
        <box
          key={bgTopicId}
          style={{
            position: 'absolute',
            top: 1 + i * 9,
            right: 1,
            width: 44,
          }}
        >
          <SubagentCard
            topicId={bgTopicId}
            liveStatus={backgroundStatuses.get(bgTopicId) ?? null}
            floating={false}
            onExpand={() => {
              setBackgroundTopics(prev => prev.filter(id => id !== bgTopicId));
              setMode({ kind: 'debate', topicId: bgTopicId });
            }}
          />
        </box>
      ))}
    </box>
  );
}
```

### Step 5: Manual test

```bash
npm run build && npm run tui
```

1. Start debate via quick preset
2. While running, press Escape
3. Should return to picker with floating SubagentCard showing in top-right
4. Card shows live progress
5. Click card or Enter existing topics → re-enters that debate
6. Start a second debate while first is running — both cards show

### Step 6: Commit

```bash
git add src/tui-opentui/App.tsx
git commit -m "feat: add background debate tracking with floating SubagentCard overlays"
```

---

## Task 7: Polish & Keyboard Shortcut Help

**Files:**
- Modify: `src/tui-opentui/components/StatusBar.tsx`
- Modify: `src/tui-opentui/components/TopicManager.tsx`

Add F2 and Escape hints to the StatusBar, and update the TopicManager home screen to show the wizard option and any running background debates count.

### Step 1: Update StatusBar with new shortcuts

In `StatusBar.tsx`, add the F2 hint to the key help section (around line 66):

```tsx
<text style={{ fg: theme.text.dim }}>[</text>
<text style={{ bold: false, fg: theme.text.secondary }}>F2</text>
<text style={{ fg: theme.text.dim }}>] compact </text>
<text style={{ fg: theme.text.dim }}>[</text>
<text style={{ bold: false, fg: theme.text.secondary }}>Esc</text>
<text style={{ fg: theme.text.dim }}>] minimize </text>
```

### Step 2: Update TopicManager home screen

In the home phase render of `TopicManager.tsx`, the [W] option is already added in Task 1. Verify it renders between [N] and [Q].

### Step 3: Verify build and test

```bash
npm run build && npm run tui
```

Expected: StatusBar shows new shortcuts, home screen shows [W] option.

### Step 4: Commit

```bash
git add src/tui-opentui/components/StatusBar.tsx src/tui-opentui/components/TopicManager.tsx
git commit -m "feat: add keyboard shortcut hints for F2/Escape in StatusBar and wizard option in TopicManager"
```

---

## Task 8: Final Verification

**Files:** None new

### Step 1: TypeScript compile check

```bash
npx tsc --noEmit
```

Expected: Clean compile, no errors.

### Step 2: Run full test suite

```bash
npm test
```

Expected: All existing tests pass (no test regressions).

### Step 3: Build

```bash
npm run build
```

Expected: Clean build.

### Step 4: End-to-end manual test — Wizard Flow

```bash
npm run tui
```

1. Press `W` → enters wizard
2. Type question "Should we use WebSockets?", Enter
3. Set agent count to 3, Enter
4. Select roles (skeptic, proponent, analyst), models for each
5. Edit personas or Tab to skip
6. Confirm screen → Enter
7. Transitions to full debate view
8. All 3 agents start thinking with correct models
9. F2 collapses to SubagentCard
10. F2 again expands back

### Step 5: End-to-end manual test — Background Debates

```bash
npm run tui
```

1. Start debate via quick preset (N → "test topic" → quick)
2. While running, press Escape → returns to picker
3. Floating SubagentCard appears showing debate progress
4. Start second debate via wizard (W → ... → confirm)
5. Both debates visible — one as SubagentCard, one full screen
6. Click SubagentCard → switches to that debate

### Step 6: End-to-end manual test — MCP Path (no changes needed)

```bash
# In OpenCode:
/debate Should we adopt a monorepo?
```

Verify: The existing MCP tools still work. No regressions in `forum.start_debate_async`, `forum.get_live_status`, etc.

### Step 7: Final commit

```bash
git add -A
git commit -m "feat: complete subagent-style UI and interactive topic creation"
```

---

## Summary

| Task | Files | Key Change |
|------|-------|------------|
| 1 | App.tsx, TopicManager.tsx | Extend AppMode with wizard/launching states |
| 2 | TopicWizard.tsx, index.ts | 5-step interactive questionnaire component |
| 3 | App.tsx | Wire wizard completion → DebateController.runDebateAsync |
| 4 | SubagentCard.tsx, index.ts | Compact floating card for debate-in-progress |
| 5 | App.tsx | F2 toggle between card and full view |
| 6 | App.tsx | Background topic tracking with floating overlays |
| 7 | StatusBar.tsx, TopicManager.tsx | Polish shortcuts and help text |
| 8 | — | Full verification pass |

**Parallelizable:** Tasks 1+2 must be sequential (2 depends on 1). Task 4 is independent (can parallel with 3). Tasks 5-6 depend on 4. Task 7 can parallel with 5-6.

**Critical path:** 1 → 2 → 3 → 5 → 6 → 8, with 4 branching off at any point and 7 joining before 8.

**Effort estimate:** Medium (~3-4 hours implementation, mostly in Task 2 and Task 6).
