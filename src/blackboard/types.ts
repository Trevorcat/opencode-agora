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
  model: string;
  provider: string;
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

export interface ProviderConfig {
  baseURL: string;
  apiKeyEnv: string;
}

export interface AgoraConfig {
  providers: Record<string, ProviderConfig>;
}
