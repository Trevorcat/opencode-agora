import type { AgentConfig, BlackboardItem, Guidance, Post } from "../blackboard/types.js";
import type { DetectedLanguage } from "../utils/language-detect.js";
import { getLanguageInstruction } from "../utils/language-detect.js";

export interface BuiltPrompt {
  system: string;
  userText: string;
}

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
  language?: DetectedLanguage;
}): BuiltPrompt {
  const { agent, question, context, guidance, blackboard, language } = params;

  const langInstruction = language ? getLanguageInstruction(language) : "";

  const systemParts = [
    `You are participating as: ${agent.role}.`,
    `Persona: ${agent.persona}.`,
    "Return ONLY valid JSON. Do not include any text outside the JSON object.",
    "Use this schema:",
    round1JsonSchema,
    "Field requirements:",
    "- position: string",
    "- reasoning: string[]",
    "- confidence: number between 0-1",
    "- open_questions: optional string[]",
  ];

  if (langInstruction) {
    systemParts.push(langInstruction);
    systemParts.push("Keep all JSON keys in English. Only values should be in the target language.");
  }

  const system = systemParts.join("\n");

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

  return {
    system,
    userText: sections.join("\n\n"),
  };
}

// ── Two-phase round prompts ────────────────────────────────────────────────────
//
// Each round N > 1 is split into two phases:
//
//   Phase 1 (parallel): every agent produces a concise DRAFT of their current
//   position.  As soon as an agent's draft is ready it is injected into every
//   other agent's session history as a plain user message so the receiving
//   model will see it before Phase 2 begins.
//
//   Phase 2 (starts as soon as an agent has received ALL peer drafts): each
//   agent produces its FINAL post — a full response that must engage with the
//   peer drafts it received.
//
// The result is parallel execution with genuine peer awareness inside a round.

const draftJsonSchema = `{
  "position": "string",
  "reasoning": ["string"],
  "confidence": 0.0
}`;

const finalJsonSchema = `{
  "position": "string",
  "reasoning": ["string"],
  "confidence": 0.0,
  "open_questions": ["string"],
  "responses_to_peers": [{"to_role": "string", "stance": "agree|partially_agree|disagree", "comment": "string"}]
}`;

/** Phase 1: ask an agent for a concise draft position (no peer context yet). */
export function buildDraftPrompt(params: {
  agent: AgentConfig;
  question: string;
  round: number;
  context?: string;
  guidance?: Guidance[];
  blackboard?: BlackboardItem[];
  language?: DetectedLanguage;
}): BuiltPrompt {
  const { agent, question, round, context, guidance, blackboard, language } = params;
  const langInstruction = language ? getLanguageInstruction(language) : "";

  const systemParts = [
    `You are participating as: ${agent.role}.`,
    `Persona: ${agent.persona}.`,
    `This is Round ${round}, Phase 1 of 2.`,
    "State your current position concisely. You will see peer positions shortly and respond in Phase 2.",
    "Return ONLY valid JSON. Do not include any text outside the JSON object.",
    "Use this schema:",
    draftJsonSchema,
    "Field requirements:",
    "- position: string (your current stance, 1-3 sentences)",
    "- reasoning: string[] (2-4 key supporting arguments)",
    "- confidence: number between 0-1",
  ];

  if (langInstruction) {
    systemParts.push(langInstruction);
    systemParts.push("Keep all JSON keys in English. Only values should be in the target language.");
  }

  const sections: string[] = [`Question: ${question}`];

  if (context) sections.push(`Context: ${context}`);

  if (blackboard && blackboard.length > 0) {
    const pinned = blackboard.filter(item => item.pinned);
    if (pinned.length > 0) {
      sections.push("📌 Shared Blackboard:");
      for (const item of pinned) sections.push(`  [${item.type}] ${item.content}`);
    }
  }

  if (guidance && guidance.length > 0) {
    sections.push("💡 Human Guidance:");
    for (const g of guidance) sections.push(`  - ${g.content}`);
  }

  return { system: systemParts.join("\n"), userText: sections.join("\n\n") };
}

/**
 * The plain-text notification injected into a session when a peer's draft
 * arrives.  This is sent as a user message so it becomes part of history.
 */
export function buildPeerDraftNotification(params: {
  fromRole: string;
  fromModel: string;
  position: string;
  reasoning: string[];
  confidence: number;
}): string {
  const { fromRole, fromModel, position, reasoning, confidence } = params;
  const lines = [
    `[PEER DRAFT — ${fromRole} (${fromModel}), confidence ${confidence.toFixed(2)}]`,
    `Position: ${position}`,
    "Reasoning:",
    ...reasoning.map(r => `  - ${r}`),
    "",
    "You will be asked to give your final response once all peer drafts have arrived.",
    "Do NOT reply yet — just acknowledge with a single word: noted.",
  ];
  return lines.join("\n");
}

/** Phase 2: ask an agent for its final post now that all peer drafts are in session history. */
export function buildFinalResponsePrompt(params: {
  agent: AgentConfig;
  round: number;
  peerRoles: string[];
  language?: DetectedLanguage;
}): BuiltPrompt {
  const { agent, round, peerRoles, language } = params;
  const langInstruction = language ? getLanguageInstruction(language) : "";

  const systemParts = [
    `You are participating as: ${agent.role}.`,
    `Persona: ${agent.persona}.`,
    `This is Round ${round}, Phase 2 of 2 — your FINAL response.`,
    `You have just received draft positions from: ${peerRoles.join(", ")}.`,
    "Now produce your definitive post. You MUST:",
    "  1. Directly engage with each peer's draft (agree, partially agree, or disagree with specific reasoning).",
    "  2. Refine or defend your own position in light of what you read.",
    "  3. Fill responses_to_peers with one entry per peer.",
    "Return ONLY valid JSON. Do not include any text outside the JSON object.",
    "Use this schema:",
    finalJsonSchema,
    "Field requirements:",
    "- position: string (your final, refined stance)",
    "- reasoning: string[] (your arguments, updated if needed)",
    "- confidence: number between 0-1",
    "- open_questions: optional string[]",
    "- responses_to_peers: REQUIRED — one entry per peer listed above",
  ];

  if (langInstruction) {
    systemParts.push(langInstruction);
    systemParts.push("Keep all JSON keys in English. Only values should be in the target language.");
  }

  return {
    system: systemParts.join("\n"),
    userText: "All peer drafts have been delivered to your session. Please give your final response now.",
  };
}

// ── Legacy single-phase prompt (kept for Round 1 and vote) ───────────────────

export function buildRoundNPrompt(params: {
  agent: AgentConfig;
  question: string;
  round: number;
  prevPosts: Post[];
  context?: string;
  guidance?: Guidance[];
  blackboard?: BlackboardItem[];
  language?: DetectedLanguage;
}): BuiltPrompt {
  const { agent, question, round, prevPosts, context, guidance, blackboard, language } = params;
  const previousRound = prevPosts.length
    ? prevPosts.map((post, index) => `Post ${index + 1}\n${formatPost(post)}`).join("\n\n")
    : "No previous posts provided.";

  const roundNJsonSchema = `{
  "position": "string",
  "reasoning": ["string"],
  "confidence": 0.0,
  "open_questions": ["string"],
  "responses_to_peers": [{"to_role": "string", "stance": "agree|partially_agree|disagree", "comment": "string"}]
}`;

  const langInstruction = language ? getLanguageInstruction(language) : "";

  const systemParts = [
    `You are participating as: ${agent.role}.`,
    `Persona: ${agent.persona}.`,
    `Round ${round}.`,
    "Respond to peer positions directly and refine your own stance.",
    "Return ONLY valid JSON. Do not include any text outside the JSON object.",
    "Use this schema:",
    roundNJsonSchema,
    "Field requirements:",
    "- position: string (your updated stance)",
    "- reasoning: string[] (your arguments)",
    "- confidence: number between 0-1",
    "- open_questions: optional string[]",
    "- responses_to_peers: optional array of responses to other agents",
  ];

  if (langInstruction) {
    systemParts.push(langInstruction);
    systemParts.push("Keep all JSON keys in English. Only values should be in the target language.");
  }

  const system = systemParts.join("\n");

  const sections: string[] = [
    `Question: ${question}`,
  ];

  if (context) {
    sections.push(`Context: ${context}`);
  }

  if (blackboard && blackboard.length > 0) {
    const pinned = blackboard.filter(item => item.pinned);
    if (pinned.length > 0) {
      sections.push("📌 Shared Blackboard (consensus/checkpoints):");
      for (const item of pinned) {
        sections.push(`  [${item.type}] ${item.content}`);
      }
    }
  }

  if (guidance && guidance.length > 0) {
    sections.push("💡 Human Guidance:");
    for (const g of guidance) {
      sections.push(`  - ${g.content}`);
    }
  }

  sections.push(`Round ${round} previous posts:`);
  sections.push(previousRound);

  return {
    system,
    userText: sections.join("\n\n"),
  };
}

export function buildVotePrompt(params: {
  agent: AgentConfig;
  question: string;
  allPosts: Post[][];
  blackboard?: BlackboardItem[];
  language?: DetectedLanguage;
}): BuiltPrompt {
  const { agent, question, allPosts, blackboard, language } = params;

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

  const langInstruction = language ? getLanguageInstruction(language) : "";

  const systemParts = [
    `You are participating as: ${agent.role}.`,
    `Persona: ${agent.persona}.`,
    "Review all debate rounds and cast a final vote.",
    "Prioritize strongest evidence and note unresolved disagreements.",
  ];

  if (langInstruction) {
    systemParts.push(langInstruction);
    systemParts.push("Keep all JSON keys in English. Only values should be in the target language.");
  }

  const system = systemParts.join("\n");

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

  return {
    system,
    userText: sections.join("\n\n"),
  };
}
