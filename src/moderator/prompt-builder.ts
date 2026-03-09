import type { AgentConfig, BlackboardItem, Guidance, Post } from "../blackboard/types.js";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const round1JsonSchema = `{
  "position": "string",
  "reasoning": ["string"],
  "confidence": 0.0,
  "open_questions": ["string"]
}`;

const voteJsonSchema = `{
  "chosen_position": "string",
  "rationale": "string",
  "confidence": 0.0,
  "dissent_notes": "string"
}`;

function formatPost(post: Post): string {
  const reasoning = post.reasoning.map((item) => `- ${item}`).join("\n");
  const openQuestions = post.open_questions?.length
    ? `\nOpen questions:\n${post.open_questions.map((item) => `- ${item}`).join("\n")}`
    : "";

  return [
    `${post.role} (${post.model})`,
    `Round: ${post.round}`,
    `Position: ${post.position}`,
    `Reasoning:\n${reasoning}`,
    `Confidence: ${post.confidence}`,
    openQuestions,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildRound1Prompt(params: {
  agent: AgentConfig;
  question: string;
  context?: string;
  guidance?: Guidance[];
  blackboard?: BlackboardItem[];
}): ChatMessage[] {
  const { agent, question, context, guidance, blackboard } = params;

  const system = [
    `You are participating as: ${agent.role}.`,
    `Persona: ${agent.persona}.`,
    "Return ONLY valid JSON.",
    "Use this schema:",
    round1JsonSchema,
    "Field requirements:",
    "- position: string",
    "- reasoning: string[]",
    "- confidence: number between 0-1",
    "- open_questions: optional string[]",
  ].join("\n");

  const sections: string[] = [
    `Question: ${question}`,
  ];

  if (context) {
    sections.push(`Context: ${context}`);
  }

  // Add pinned blackboard content
  if (blackboard && blackboard.length > 0) {
    const pinned = blackboard.filter(item => item.pinned);
    if (pinned.length > 0) {
      sections.push("📌 Shared Blackboard (consensus/checkpoints):");
      for (const item of pinned) {
        sections.push(`  [${item.type}] ${item.content}`);
      }
    }
  }

  // Add human guidance
  if (guidance && guidance.length > 0) {
    sections.push("💡 Human Guidance:");
    for (const g of guidance) {
      sections.push(`  - ${g.content}`);
    }
  }

  return [
    { role: "system", content: system },
    { role: "user", content: sections.join("\n\n") },
  ];
}

export function buildRoundNPrompt(params: {
  agent: AgentConfig;
  question: string;
  round: number;
  prevPosts: Post[];
  context?: string;
  guidance?: Guidance[];
  blackboard?: BlackboardItem[];
}): ChatMessage[] {
  const { agent, question, round, prevPosts, context, guidance, blackboard } = params;
  const previousRound = prevPosts.length
    ? prevPosts.map((post, index) => `Post ${index + 1}\n${formatPost(post)}`).join("\n\n")
    : "No previous posts provided.";

  const system = [
    `You are participating as: ${agent.role}.`,
    `Persona: ${agent.persona}.`,
    `Round ${round}.`,
    "Respond to peer positions directly and refine your own stance.",
  ].join("\n");

  const sections: string[] = [
    `Question: ${question}`,
  ];

  if (context) {
    sections.push(`Context: ${context}`);
  }

  // Add pinned blackboard content
  if (blackboard && blackboard.length > 0) {
    const pinned = blackboard.filter(item => item.pinned);
    if (pinned.length > 0) {
      sections.push("📌 Shared Blackboard (consensus/checkpoints):");
      for (const item of pinned) {
        sections.push(`  [${item.type}] ${item.content}`);
      }
    }
  }

  // Add human guidance
  if (guidance && guidance.length > 0) {
    sections.push("💡 Human Guidance:");
    for (const g of guidance) {
      sections.push(`  - ${g.content}`);
    }
  }

  sections.push(`Round ${round} previous posts:`);
  sections.push(previousRound);

  return [
    { role: "system", content: system },
    { role: "user", content: sections.join("\n\n") },
  ];
}

export function buildVotePrompt(params: {
  agent: AgentConfig;
  question: string;
  allPosts: Post[][];
  blackboard?: BlackboardItem[];
}): ChatMessage[] {
  const { agent, question, allPosts, blackboard } = params;

  const history = allPosts.length
    ? allPosts
        .map((posts, roundIndex) => {
          const roundHeader = `Round ${roundIndex + 1}`;
          const roundBody = posts.length
            ? posts.map((post, index) => `Post ${index + 1}\n${formatPost(post)}`).join("\n\n")
            : "No posts recorded.";
          return `${roundHeader}\n${roundBody}`;
        })
        .join("\n\n")
    : "No debate history provided.";

  const system = [
    `You are participating as: ${agent.role}.`,
    `Persona: ${agent.persona}.`,
    "Review all debate rounds and cast a final vote.",
    "Prioritize strongest evidence and note unresolved disagreements.",
  ].join("\n");

  const sections: string[] = [
    `Question: ${question}`,
  ];

  // Add pinned blackboard content
  if (blackboard && blackboard.length > 0) {
    const pinned = blackboard.filter(item => item.pinned);
    if (pinned.length > 0) {
      sections.push("📌 Shared Blackboard (established consensus):");
      for (const item of pinned) {
        sections.push(`  [${item.type}] ${item.content}`);
      }
    }
  }

  sections.push("Debate history:");
  sections.push(history);
  sections.push("Return ONLY valid JSON with this schema:");
  sections.push(voteJsonSchema);
  sections.push("Field requirements:");
  sections.push("- chosen_position: string");
  sections.push("- rationale: string");
  sections.push("- confidence: number between 0-1");
  sections.push("- dissent_notes: optional string");

  return [
    { role: "system", content: system },
    { role: "user", content: sections.join("\n\n") },
  ];
}

export type { ChatMessage };
