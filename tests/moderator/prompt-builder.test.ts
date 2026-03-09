import { describe, expect, it } from "vitest";
import type { AgentConfig, Post } from "../../src/blackboard/types.js";
import {
  buildRound1Prompt,
  buildRoundNPrompt,
  buildVotePrompt,
} from "../../src/moderator/prompt-builder.js";

describe("prompt-builder", () => {
  const agent: AgentConfig = {
    role: "economist",
    persona: "Evidence-first analyst",
    model: "gpt-x",
    provider: "openai",
  };

  it("buildRound1Prompt includes question, persona, and required JSON fields", () => {
    const messages = buildRound1Prompt({
      agent,
      question: "Should the city implement congestion pricing?",
      context: "Traffic is up 20% year-over-year.",
    });

    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe("system");
    expect(messages[1]?.role).toBe("user");

    expect(messages[0]?.content).toContain(agent.persona);
    expect(messages[1]?.content).toContain("Should the city implement congestion pricing?");
    expect(messages[1]?.content).toContain("Traffic is up 20% year-over-year.");

    expect(messages[0]?.content).toContain("position");
    expect(messages[0]?.content).toContain("reasoning");
    expect(messages[0]?.content).toContain("confidence");
    expect(messages[0]?.content).toContain("open_questions");
    expect(messages[0]?.content).toContain("0-1");
  });

  it("buildRoundNPrompt includes previous posts content and round number", () => {
    const prevPosts: Post[] = [
      {
        role: "engineer",
        model: "model-a",
        round: 1,
        timestamp: "2026-03-09T10:00:00.000Z",
        position: "Implement with pilot zones first.",
        reasoning: ["Reduces risk", "Allows measured rollout"],
        confidence: 0.82,
      },
      {
        role: "ethicist",
        model: "model-b",
        round: 1,
        timestamp: "2026-03-09T10:01:00.000Z",
        position: "Pair policy with equity offsets.",
        reasoning: ["Avoid burden on low-income commuters"],
        confidence: 0.75,
        open_questions: ["How will subsidy eligibility be determined?"],
      },
    ];

    const messages = buildRoundNPrompt({
      agent,
      question: "Should the city implement congestion pricing?",
      round: 2,
      prevPosts,
      context: "Traffic is up 20% year-over-year.",
    });

    expect(messages).toHaveLength(2);
    expect(messages[0]?.content).toContain("Round 2");
    expect(messages[0]?.content).toContain(agent.role);
    expect(messages[0]?.content).toContain(agent.persona);

    expect(messages[1]?.content).toContain("Should the city implement congestion pricing?");
    expect(messages[1]?.content).toContain("Round 2");
    expect(messages[1]?.content).toContain("Implement with pilot zones first.");
    expect(messages[1]?.content).toContain("Pair policy with equity offsets.");
    expect(messages[1]?.content).toContain("Reduces risk");
    expect(messages[1]?.content).toContain("How will subsidy eligibility be determined?");
  });

  it("buildVotePrompt includes full debate history and vote JSON schema keywords", () => {
    const allPosts: Post[][] = [
      [
        {
          role: "engineer",
          model: "model-a",
          round: 1,
          timestamp: "2026-03-09T10:00:00.000Z",
          position: "Implement with pilot zones first.",
          reasoning: ["Reduces risk"],
          confidence: 0.82,
        },
      ],
      [
        {
          role: "economist",
          model: "model-c",
          round: 2,
          timestamp: "2026-03-09T10:05:00.000Z",
          position: "Implement citywide with rebates.",
          reasoning: ["Faster impact", "Revenue can fund transit"],
          confidence: 0.78,
          open_questions: ["What rebate level avoids regressivity?"],
        },
      ],
    ];

    const messages = buildVotePrompt({
      agent,
      question: "Should the city implement congestion pricing?",
      allPosts,
    });

    expect(messages).toHaveLength(2);
    expect(messages[0]?.content).toContain(agent.role);
    expect(messages[0]?.content).toContain(agent.persona);

    expect(messages[1]?.content).toContain("Should the city implement congestion pricing?");
    expect(messages[1]?.content).toContain("Implement with pilot zones first.");
    expect(messages[1]?.content).toContain("Implement citywide with rebates.");
    expect(messages[1]?.content).toContain("What rebate level avoids regressivity?");

    expect(messages[1]?.content).toContain("chosen_position");
    expect(messages[1]?.content).toContain("rationale");
    expect(messages[1]?.content).toContain("confidence");
    expect(messages[1]?.content).toContain("dissent_notes");
  });
});
