import { describe, expect, it } from "vitest";
import type { AgentConfig, BlackboardItem, Guidance, Post } from "../../src/blackboard/types.js";
import {
  buildRound1Prompt,
  buildRoundNPrompt,
  buildVotePrompt,
} from "../../src/moderator/prompt-builder.js";

describe("prompt-builder guidance and blackboard", () => {
  const agent: AgentConfig = {
    role: "economist",
    persona: "Evidence-first analyst",
    model: "openai/gpt-x",
  };

  const question = "Should the city implement congestion pricing?";

  // ─── buildRound1Prompt with guidance ───────────────────────────────────────

  it("buildRound1Prompt: guidance appears in user message content", () => {
    const guidance: Guidance[] = [
      {
        id: "g1",
        content: "Focus on equity impacts for low-income residents.",
        timestamp: "2026-03-09T10:00:00.000Z",
        consumed: false,
      },
    ];

    const result = buildRound1Prompt({
      agent,
      question,
      guidance,
    });

    const userContent = result.userText;
    expect(userContent).toContain("Focus on equity impacts for low-income residents.");
  });

  it("buildRound1Prompt: multiple guidance items all included", () => {
    const guidance: Guidance[] = [
      {
        id: "g1",
        content: "Focus on equity impacts.",
        timestamp: "2026-03-09T10:00:00.000Z",
        consumed: false,
      },
      {
        id: "g2",
        content: "Consider revenue use for transit subsidies.",
        timestamp: "2026-03-09T10:01:00.000Z",
        consumed: false,
      },
      {
        id: "g3",
        content: "Compare to London and Singapore models.",
        timestamp: "2026-03-09T10:02:00.000Z",
        consumed: false,
      },
    ];

    const result = buildRound1Prompt({
      agent,
      question,
      guidance,
    });

    const userContent = result.userText;
    expect(userContent).toContain("Focus on equity impacts.");
    expect(userContent).toContain("Consider revenue use for transit subsidies.");
    expect(userContent).toContain("Compare to London and Singapore models.");
  });

  it("buildRound1Prompt: guidance section header 'Human Guidance' present", () => {
    const guidance: Guidance[] = [
      {
        id: "g1",
        content: "Focus on equity impacts.",
        timestamp: "2026-03-09T10:00:00.000Z",
        consumed: false,
      },
    ];

    const result = buildRound1Prompt({
      agent,
      question,
      guidance,
    });

    const userContent = result.userText;
    expect(userContent).toContain("Human Guidance");
  });

  it("buildRound1Prompt: empty guidance array → no guidance section", () => {
    const guidance: Guidance[] = [];

    const result = buildRound1Prompt({
      agent,
      question,
      guidance,
    });

    const userContent = result.userText;
    expect(userContent).not.toContain("Human Guidance");
  });

  // ─── buildRound1Prompt with blackboard ──────────────────────────────────────

  it("buildRound1Prompt: pinned blackboard items appear in user message", () => {
    const blackboard: BlackboardItem[] = [
      {
        id: "b1",
        type: "consensus",
        content: "All agree: policy must include equity safeguards.",
        author: "moderator",
        timestamp: "2026-03-09T10:00:00.000Z",
        round: 1,
        pinned: true,
        editable: false,
      },
    ];

    const result = buildRound1Prompt({
      agent,
      question,
      blackboard,
    });

    const userContent = result.userText;
    expect(userContent).toContain("All agree: policy must include equity safeguards.");
  });

  it("buildRound1Prompt: non-pinned items NOT included", () => {
    const blackboard: BlackboardItem[] = [
      {
        id: "b1",
        type: "note",
        content: "This is a pinned item.",
        author: "moderator",
        timestamp: "2026-03-09T10:00:00.000Z",
        round: 1,
        pinned: true,
        editable: false,
      },
      {
        id: "b2",
        type: "note",
        content: "This is NOT pinned and should not appear.",
        author: "moderator",
        timestamp: "2026-03-09T10:01:00.000Z",
        round: 1,
        pinned: false,
        editable: false,
      },
    ];

    const result = buildRound1Prompt({
      agent,
      question,
      blackboard,
    });

    const userContent = result.userText;
    expect(userContent).toContain("This is a pinned item.");
    expect(userContent).not.toContain("This is NOT pinned and should not appear.");
  });

  it("buildRound1Prompt: item type is shown: '[consensus]', '[note]', etc.", () => {
    const blackboard: BlackboardItem[] = [
      {
        id: "b1",
        type: "consensus",
        content: "Agreed: equity safeguards required.",
        author: "moderator",
        timestamp: "2026-03-09T10:00:00.000Z",
        round: 1,
        pinned: true,
        editable: false,
      },
      {
        id: "b2",
        type: "note",
        content: "Key data point: London saw 15% traffic reduction.",
        author: "human",
        timestamp: "2026-03-09T10:01:00.000Z",
        round: 1,
        pinned: true,
        editable: false,
      },
      {
        id: "b3",
        type: "checkpoint",
        content: "Round 1 complete, moving to revenue analysis.",
        author: "system",
        timestamp: "2026-03-09T10:02:00.000Z",
        round: 1,
        pinned: true,
        editable: false,
      },
    ];

    const result = buildRound1Prompt({
      agent,
      question,
      blackboard,
    });

    const userContent = result.userText;
    expect(userContent).toContain("[consensus]");
    expect(userContent).toContain("[note]");
    expect(userContent).toContain("[checkpoint]");
  });

  it("buildRound1Prompt: empty blackboard → no blackboard section", () => {
    const blackboard: BlackboardItem[] = [];

    const result = buildRound1Prompt({
      agent,
      question,
      blackboard,
    });

    const userContent = result.userText;
    expect(userContent).not.toContain("Shared Blackboard");
  });

  // ─── buildRoundNPrompt with guidance + blackboard ───────────────────────────

  it("buildRoundNPrompt: guidance AND blackboard sections both present", () => {
    const guidance: Guidance[] = [
      {
        id: "g1",
        content: "Consider revenue recycling options.",
        timestamp: "2026-03-09T10:00:00.000Z",
        consumed: false,
      },
    ];

    const blackboard: BlackboardItem[] = [
      {
        id: "b1",
        type: "consensus",
        content: "Equity safeguards are a must.",
        author: "moderator",
        timestamp: "2026-03-09T10:00:00.000Z",
        round: 1,
        pinned: true,
        editable: false,
      },
    ];

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
      question,
      round: 2,
      prevPosts,
      guidance,
      blackboard,
    });

    const userContent = result.userText;
    expect(userContent).toContain("Human Guidance");
    expect(userContent).toContain("Consider revenue recycling options.");
    expect(userContent).toContain("Shared Blackboard");
    expect(userContent).toContain("Equity safeguards are a must.");
  });

  it("buildRoundNPrompt: previous posts still included when guidance provided", () => {
    const guidance: Guidance[] = [
      {
        id: "g1",
        content: "Focus on revenue use.",
        timestamp: "2026-03-09T10:00:00.000Z",
        consumed: false,
      },
    ];

    const prevPosts: Post[] = [
      {
        role: "engineer",
        model: "model-a",
        round: 1,
        timestamp: "2026-03-09T10:00:00.000Z",
        position: "Implement with pilot zones.",
        reasoning: ["Reduces risk", "Allows measured rollout"],
        confidence: 0.82,
      },
    ];

    const result = buildRoundNPrompt({
      agent,
      question,
      round: 2,
      prevPosts,
      guidance,
    });

    const userContent = result.userText;
    expect(userContent).toContain("Human Guidance");
    expect(userContent).toContain("Focus on revenue use.");
    expect(userContent).toContain("Implement with pilot zones.");
    expect(userContent).toContain("Reduces risk");
    expect(userContent).toContain("Allows measured rollout");
  });

  it("buildRoundNPrompt: guidance section before previous posts section", () => {
    const guidance: Guidance[] = [
      {
        id: "g1",
        content: "Consider international examples.",
        timestamp: "2026-03-09T10:00:00.000Z",
        consumed: false,
      },
    ];

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
      question,
      round: 2,
      prevPosts,
      guidance,
    });

    const userContent = result.userText;
    const guidanceIndex = userContent.indexOf("Human Guidance");
    const previousPostsIndex = userContent.indexOf("Round 2 previous posts");
    expect(guidanceIndex).toBeLessThan(previousPostsIndex);
  });

  // ─── buildVotePrompt with blackboard ────────────────────────────────────────

  it("buildVotePrompt: pinned items shown under 'established consensus' header", () => {
    const blackboard: BlackboardItem[] = [
      {
        id: "b1",
        type: "consensus",
        content: "Equity safeguards required in any policy.",
        author: "moderator",
        timestamp: "2026-03-09T10:00:00.000Z",
        round: 2,
        pinned: true,
        editable: false,
      },
    ];

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
      question,
      allPosts,
      blackboard,
    });

    const userContent = result.userText;
    expect(userContent).toContain("established consensus");
    expect(userContent).toContain("Equity safeguards required in any policy.");
  });

  it("buildVotePrompt: non-pinned items excluded", () => {
    const blackboard: BlackboardItem[] = [
      {
        id: "b1",
        type: "consensus",
        content: "This IS pinned and should appear.",
        author: "moderator",
        timestamp: "2026-03-09T10:00:00.000Z",
        round: 2,
        pinned: true,
        editable: false,
      },
      {
        id: "b2",
        type: "note",
        content: "This is NOT pinned and should NOT appear.",
        author: "moderator",
        timestamp: "2026-03-09T10:01:00.000Z",
        round: 2,
        pinned: false,
        editable: false,
      },
    ];

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
      question,
      allPosts,
      blackboard,
    });

    const userContent = result.userText;
    expect(userContent).toContain("This IS pinned and should appear.");
    expect(userContent).not.toContain("This is NOT pinned and should NOT appear.");
  });

  it("buildVotePrompt: full debate history still included", () => {
    const blackboard: BlackboardItem[] = [
      {
        id: "b1",
        type: "consensus",
        content: "Equity safeguards required.",
        author: "moderator",
        timestamp: "2026-03-09T10:00:00.000Z",
        round: 2,
        pinned: true,
        editable: false,
      },
    ];

    const allPosts: Post[][] = [
      [
        {
          role: "engineer",
          model: "model-a",
          round: 1,
          timestamp: "2026-03-09T10:00:00.000Z",
          position: "Implement with pilot zones.",
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
        },
      ],
    ];

    const result = buildVotePrompt({
      agent,
      question,
      allPosts,
      blackboard,
    });

    const userContent = result.userText;
    expect(userContent).toContain("established consensus");
    expect(userContent).toContain("Equity safeguards required.");
    expect(userContent).toContain("Debate history");
    expect(userContent).toContain("Round 1");
    expect(userContent).toContain("Round 2");
    expect(userContent).toContain("Implement with pilot zones.");
    expect(userContent).toContain("Pair policy with equity offsets.");
    expect(userContent).toContain("Implement citywide with rebates.");
    expect(userContent).toContain("Reduces risk");
    expect(userContent).toContain("Faster impact");
  });
});
