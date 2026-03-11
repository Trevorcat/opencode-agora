/**
 * JSON Schemas for OpenCode HTTP API Agent Output Validation
 *
 * These schemas are used as `format.schema` fields in HTTP API requests
 * to enforce structured JSON output from agents during debate rounds.
 */

export const POST_ROUND1_SCHEMA = {
  type: "object" as const,
  required: ["role", "model", "round", "timestamp", "position", "reasoning", "confidence"],
  additionalProperties: false,
  properties: {
    role: { type: "string" },
    model: { type: "string" },
    round: { type: "integer", minimum: 1 },
    timestamp: { type: "string", format: "date-time" },
    position: { type: "string" },
    reasoning: {
      type: "array",
      items: { type: "string" },
      minItems: 1,
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    open_questions: {
      type: "array",
      items: { type: "string" },
    },
  },
} as const satisfies Record<string, unknown>;

export const POST_ROUNDN_SCHEMA = {
  type: "object" as const,
  required: ["role", "model", "round", "timestamp", "position", "reasoning", "responses_to_peers", "confidence"],
  additionalProperties: false,
  properties: {
    role: { type: "string" },
    model: { type: "string" },
    round: { type: "integer", minimum: 2 },
    timestamp: { type: "string", format: "date-time" },
    position: { type: "string" },
    reasoning: {
      type: "array",
      items: { type: "string" },
      minItems: 1,
    },
    responses_to_peers: {
      type: "array",
      items: {
        type: "object",
        required: ["to_role", "stance", "comment"],
        additionalProperties: false,
        properties: {
          to_role: { type: "string" },
          stance: {
            type: "string",
            enum: ["agree", "partially_agree", "disagree"],
          },
          comment: { type: "string" },
        },
      },
      minItems: 1,
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    open_questions: {
      type: "array",
      items: { type: "string" },
    },
  },
} as const satisfies Record<string, unknown>;

export const VOTE_SCHEMA = {
  type: "object" as const,
  required: ["role", "model", "timestamp", "chosen_position", "rationale", "confidence"],
  additionalProperties: false,
  properties: {
    role: { type: "string" },
    model: { type: "string" },
    timestamp: { type: "string", format: "date-time" },
    chosen_position: { type: "string" },
    rationale: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    dissent_notes: { type: "string" },
  },
} as const satisfies Record<string, unknown>;

export const CONSENSUS_SCHEMA = {
  type: "object" as const,
  required: [
    "topic_id",
    "conclusion",
    "confidence",
    "key_arguments",
    "dissenting_views",
    "convergence_method",
    "vote_distribution",
    "rounds_taken",
    "generated_by",
  ],
  additionalProperties: false,
  properties: {
    topic_id: { type: "string" },
    conclusion: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    key_arguments: {
      type: "array",
      items: { type: "string" },
      minItems: 1,
    },
    dissenting_views: {
      type: "array",
      items: { type: "string" },
    },
    convergence_method: { type: "string" },
    vote_distribution: {
      type: "object",
      additionalProperties: { type: "integer", minimum: 0 },
    },
    rounds_taken: { type: "integer", minimum: 1 },
    generated_by: { type: "string" },
  },
} as const satisfies Record<string, unknown>;
