// src/blackboard/types.ts
// All data model types for the Agora debate system.

export type DebateStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed";

export interface AgentConfig {
  role: string;
  persona: string;
  /** Fully qualified model ID: "provider/model", e.g. "lilith/claude-opus-4-6" */
  model: string;
}

export interface DebateConfig {
  max_rounds: number;
  consensus_threshold: number;
  agents: AgentConfig[];
}

export interface Topic {
  id: string;
  question: string;
  context?: string;
  constraints?: string[];
  status: DebateStatus;
  config: DebateConfig;
  /** Detected language of the question (e.g. "zh", "ja", "en") */
  language?: string;
  created_at: string; // ISO 8601
  completed_at?: string;
}

export interface PeerResponse {
  to_role: string;
  stance: "agree" | "partially_agree" | "disagree";
  comment: string;
}

export interface Post {
  role: string;
  model: string;
  round: number;
  timestamp: string;
  position: string;
  reasoning: string[];
  responses_to_peers?: PeerResponse[];
  confidence: number; // 0-1
  open_questions?: string[];
}

export interface Vote {
  role: string;
  model: string;
  timestamp: string;
  chosen_position: string;
  rationale: string;
  confidence: number;
  dissent_notes?: string;
}

export interface Consensus {
  topic_id: string;
  conclusion: string;
  confidence: number;
  vote_distribution: Record<string, number>;
  key_arguments: string[];
  dissenting_views: string[];
  rounds_taken: number;
  convergence_method: string;
  generated_by: string;
}

// ─── Blackboard & Guidance System ────────────────────────────────────────────

/** Pinned content on the shared blackboard */
export interface BlackboardItem {
  id: string;
  type: "consensus" | "guidance" | "checkpoint" | "note";
  content: string;
  author: string; // "system" | "moderator" | "human" | agent role
  timestamp: string;
  round: number;
  pinned: boolean; // if true, prominently shown to all agents
  editable: boolean; // if true, can be modified by agents
  metadata?: Record<string, unknown>;
}

/** Human intervention/guidance queued for next round */
export interface Guidance {
  id: string;
  content: string;
  timestamp: string;
  consumed: boolean; // set to true after being shown to agents
  target_round?: number; // if set, only shown in this round
  target_agents?: string[]; // if set, only shown to these roles
}

/** Extended Topic with blackboard and live debate state */
export interface TopicWithBlackboard extends Topic {
  blackboard: BlackboardItem[];
  guidance_queue: Guidance[];
  current_round: number;
  paused: boolean;
  pause_reason?: string;
  attached_sessions: string[]; // session IDs monitoring this topic
}

/** Real-time debate status for TUI/monitoring */
export interface LiveStatus {
  topic_id: string;
  question: string;
  /** Detected language of question, e.g. zh/en */
  language?: string;
  status: DebateStatus | "paused";
  current_round: number;
  total_rounds: number;
  agents: Array<{
    role: string;
    model: string;
    status: "waiting" | "thinking" | "posted" | "error";
    last_post?: Post;
    /** Partial streaming output while agent is thinking */
    streaming_text?: string;
    persona?: string;
  }>;
  blackboard: BlackboardItem[];
  pending_guidance: number;
  recent_posts: Post[];
  /** Latest progress message for display */
  latest_event?: string;
}

// ─── Progress Events for Real-time Notifications ────────────────────────────

export type ProgressEvent =
  | { type: "debate_started"; topic_id: string; question: string; timestamp: string }
  | { type: "round_started"; topic_id: string; round: number; timestamp: string }
  | { type: "agent_thinking"; topic_id: string; round: number; agent: string; model: string; timestamp: string }
  | { type: "agent_stream"; topic_id: string; round: number; agent: string; chunk: string; timestamp: string }
  | { type: "agent_posted"; topic_id: string; round: number; post: Post; timestamp: string }
  | { type: "agent_error"; topic_id: string; round: number; agent: string; error: string; timestamp: string }
  | { type: "round_complete"; topic_id: string; round: number; posts: Post[]; timestamp: string }
  | { type: "blackboard_updated"; topic_id: string; item: BlackboardItem; timestamp: string }
  | { type: "guidance_added"; topic_id: string; guidance: Guidance; timestamp: string }
  | { type: "paused"; topic_id: string; round: number; reason?: string; timestamp: string }
  | { type: "resumed"; topic_id: string; timestamp: string }
  | { type: "voting_started"; topic_id: string; timestamp: string }
  | { type: "vote_cast"; topic_id: string; vote: Vote; timestamp: string }
  | { type: "consensus_reached"; topic_id: string; consensus: Consensus; timestamp: string }
  | { type: "debate_complete"; topic_id: string; timestamp: string }
  | { type: "error"; topic_id: string; message: string; timestamp: string };

// ─── OpenCode integration types ─────────────────────────────────────────────

/** Resolved provider connection info, parsed from opencode.json */
export interface ResolvedProvider {
  baseURL: string;
  apiKey: string;
}

/** Parsed from opencode.json provider.*.options */
export interface OpenCodeProviderEntry {
  name?: string;
  options: {
    baseURL: string;
    apiKey: string; // raw value, may be "{env:VAR_NAME}" or a literal key
  };
  models: Record<string, { name: string; limit?: { context: number; output: number } }>;
}

/** Root shape of ~/.config/opencode/opencode.json (partial, what we need) */
export interface OpenCodeConfig {
  provider: Record<string, OpenCodeProviderEntry>;
  model?: string;
  small_model?: string;
}
