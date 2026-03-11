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
    model: "openai/gpt-x",
  };

  it("buildRound1Prompt includes question, persona, and required JSON fields", () => {
    const result = buildRound1Prompt({
      agent,
      question: "Should the city implement congestion pricing?",
      context: "Traffic is up 20% year-over-year.",
    });

    expect(result.system).toContain(agent.persona);
    expect(result.userText).toContain("Should the city implement congestion pricing?");
    expect(result.userText).toContain("Traffic is up 20% year-over-year.");

    expect(result.system).toContain("position");
    expect(result.system).toContain("reasoning");
    expect(result.system).toContain("confidence");
    expect(result.system).toContain("open_questions");
    expect(result.system).toContain("0-1");
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

    const result = buildRoundNPrompt({
      agent,
      question: "Should the city implement congestion pricing?",
      round: 2,
      prevPosts,
      context: "Traffic is up 20% year-over-year.",
    });

    expect(result.system).toContain("Round 2");
    expect(result.system).toContain(agent.role);
    expect(result.system).toContain(agent.persona);

    expect(result.userText).toContain("Should the city implement congestion pricing?");
    expect(result.userText).toContain("Round 2");
    expect(result.userText).toContain("Implement with pilot zones first.");
    expect(result.userText).toContain("Pair policy with equity offsets.");
    expect(result.userText).toContain("Reduces risk");
    expect(result.userText).toContain("How will subsidy eligibility be determined?");
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

    const result = buildVotePrompt({
      agent,
      question: "Should the city implement congestion pricing?",
      allPosts,
    });

    expect(result.system).toContain(agent.role);
    expect(result.system).toContain(agent.persona);

    expect(result.userText).toContain("Should the city implement congestion pricing?");
    expect(result.userText).toContain("Implement with pilot zones first.");
    expect(result.userText).toContain("Implement citywide with rebates.");
    expect(result.userText).toContain("What rebate level avoids regressivity?");

    expect(result.userText).toContain("chosen_position");
    expect(result.userText).toContain("rationale");
    expect(result.userText).toContain("confidence");
    expect(result.userText).toContain("dissent_notes");
  });
});
