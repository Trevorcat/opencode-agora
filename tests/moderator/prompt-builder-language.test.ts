import { describe, expect, it } from "vitest";
import type { AgentConfig, Post } from "../../src/blackboard/types.js";
import {
  buildRound1Prompt,
  buildRoundNPrompt,
  buildVotePrompt,
} from "../../src/moderator/prompt-builder.js";

describe("prompt-builder language support", () => {
  const agent: AgentConfig = {
    role: "economist",
    persona: "Evidence-first analyst",
    model: "openai/gpt-x",
  };

  const question = "城市应该实施拥堵收费吗？";

  // ─── buildRound1Prompt ─────────────────────────────────────────────────────

  it("buildRound1Prompt: Chinese language instruction injected into system prompt", () => {
    const result = buildRound1Prompt({
      agent,
      question,
      language: "zh",
    });

    const system = result.system;
    expect(system).toContain("Chinese");
    expect(system).toContain("中文");
    expect(system).toContain("MUST");
    expect(system).toContain("Keep all JSON keys in English");
  });

  it("buildRound1Prompt: English language → no language instruction", () => {
    const result = buildRound1Prompt({
      agent,
      question: "Should the city implement congestion pricing?",
      language: "en",
    });

    const system = result.system;
    expect(system).not.toContain("MUST respond entirely");
    expect(system).not.toContain("Keep all JSON keys in English");
  });

  it("buildRound1Prompt: no language param → no language instruction", () => {
    const result = buildRound1Prompt({
      agent,
      question: "Should the city implement congestion pricing?",
    });

    const system = result.system;
    expect(system).not.toContain("MUST respond entirely");
  });

  it("buildRound1Prompt: Japanese language instruction works", () => {
    const result = buildRound1Prompt({
      agent,
      question: "これはテストです",
      language: "ja",
    });

    const system = result.system;
    expect(system).toContain("Japanese");
    expect(system).toContain("日本語");
  });

  it("buildRound1Prompt: language instruction does not break JSON schema requirement", () => {
    const result = buildRound1Prompt({
      agent,
      question,
      language: "zh",
    });

    const system = result.system;
    // JSON schema still present
    expect(system).toContain("position");
    expect(system).toContain("reasoning");
    expect(system).toContain("confidence");
    expect(system).toContain("Return ONLY valid JSON");
  });

  // ─── buildRoundNPrompt ────────────────────────────────────────────────────

  it("buildRoundNPrompt: language instruction injected into system prompt", () => {
    const prevPosts: Post[] = [
      {
        role: "engineer",
        model: "model-a",
        round: 1,
        timestamp: "2026-03-09T10:00:00.000Z",
        position: "试点区域实施",
        reasoning: ["降低风险"],
        confidence: 0.82,
      },
    ];

    const result = buildRoundNPrompt({
      agent,
      question,
      round: 2,
      prevPosts,
      language: "zh",
    });

    const system = result.system;
    expect(system).toContain("Chinese");
    expect(system).toContain("中文");
    expect(system).toContain("Keep all JSON keys in English");
  });

  it("buildRoundNPrompt: English → no language instruction", () => {
    const prevPosts: Post[] = [
      {
        role: "engineer",
        model: "model-a",
        round: 1,
        timestamp: "2026-03-09T10:00:00.000Z",
        position: "Implement with pilot zones.",
        reasoning: ["Reduces risk"],
        confidence: 0.82,
      },
    ];

    const result = buildRoundNPrompt({
      agent,
      question: "Should the city implement congestion pricing?",
      round: 2,
      prevPosts,
      language: "en",
    });

    const system = result.system;
    expect(system).not.toContain("MUST respond entirely");
  });

  // ─── buildVotePrompt ──────────────────────────────────────────────────────

  it("buildVotePrompt: language instruction injected into system prompt", () => {
    const allPosts: Post[][] = [
      [
        {
          role: "engineer",
          model: "model-a",
          round: 1,
          timestamp: "2026-03-09T10:00:00.000Z",
          position: "试点区域实施",
          reasoning: ["降低风险"],
          confidence: 0.82,
        },
      ],
    ];

    const result = buildVotePrompt({
      agent,
      question,
      allPosts,
      language: "ko",
    });

    const system = result.system;
    expect(system).toContain("Korean");
    expect(system).toContain("한국어");
    expect(system).toContain("Keep all JSON keys in English");
  });

  it("buildVotePrompt: English → no language instruction", () => {
    const allPosts: Post[][] = [
      [
        {
          role: "engineer",
          model: "model-a",
          round: 1,
          timestamp: "2026-03-09T10:00:00.000Z",
          position: "Implement with pilot zones.",
          reasoning: ["Reduces risk"],
          confidence: 0.82,
        },
      ],
    ];

    const result = buildVotePrompt({
      agent,
      question: "Should the city implement congestion pricing?",
      allPosts,
      language: "en",
    });

    const system = result.system;
    expect(system).not.toContain("MUST respond entirely");
  });

  it("buildVotePrompt: no language param → no language instruction", () => {
    const allPosts: Post[][] = [
      [
        {
          role: "engineer",
          model: "model-a",
          round: 1,
          timestamp: "2026-03-09T10:00:00.000Z",
          position: "Implement with pilot zones.",
          reasoning: ["Reduces risk"],
          confidence: 0.82,
        },
      ],
    ];

    const result = buildVotePrompt({
      agent,
      question: "Should the city implement congestion pricing?",
      allPosts,
    });

    const system = result.system;
    expect(system).not.toContain("MUST respond entirely");
  });
});
