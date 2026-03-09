import type { AgentConfig, Post } from "../blackboard/types.js";

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
}): ChatMessage[] {
  const { agent, question, context } = params;

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

  const user = [
    `Question: ${question}`,
    context ? `Context: ${context}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export function buildRoundNPrompt(params: {
  agent: AgentConfig;
  question: string;
  round: number;
  prevPosts: Post[];
  context?: string;
}): ChatMessage[] {
  const { agent, question, round, prevPosts, context } = params;
  const previousRound = prevPosts.length
    ? prevPosts.map((post, index) => `Post ${index + 1}\n${formatPost(post)}`).join("\n\n")
    : "No previous posts provided.";

  const system = [
    `You are participating as: ${agent.role}.`,
    `Persona: ${agent.persona}.`,
    `Round ${round}.`,
    "Respond to peer positions directly and refine your own stance.",
  ].join("\n");

  const user = [
    `Question: ${question}`,
    context ? `Context: ${context}` : "",
    `Round ${round} previous posts:`,
    previousRound,
  ]
    .filter(Boolean)
    .join("\n\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export function buildVotePrompt(params: {
  agent: AgentConfig;
  question: string;
  allPosts: Post[][];
}): ChatMessage[] {
  const { agent, question, allPosts } = params;

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

  const user = [
    `Question: ${question}`,
    "Debate history:",
    history,
    "Return ONLY valid JSON with this schema:",
    voteJsonSchema,
    "Field requirements:",
    "- chosen_position: string",
    "- rationale: string",
    "- confidence: number between 0-1",
    "- dissent_notes: optional string",
  ].join("\n\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export type { ChatMessage };
