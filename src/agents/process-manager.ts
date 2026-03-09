import OpenAI from "openai";

import type {
  AgentConfig,
  Post,
  ProviderConfig,
  Vote,
} from "../blackboard/types.js";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type JsonRecord = Record<string, unknown>;

export class AgentProcessManager {
  private readonly clients = new Map<string, OpenAI>();

  constructor(private readonly providers: Record<string, ProviderConfig>) {}

  async callAgent(
    agent: AgentConfig,
    messages: ChatMessage[],
    round: number,
  ): Promise<Post> {
    const client = this.getClient(agent.provider);
    const response = await client.chat.completions.create({
      model: agent.model,
      messages,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    const parsed = this.parseJSON(content);
    const payload = this.toRecord(parsed, "Agent response must be a JSON object");

    const position = this.readString(payload, "position");
    const reasoning = this.readStringArray(payload, "reasoning");

    return {
      role: agent.role,
      model: agent.model,
      round,
      timestamp: new Date().toISOString(),
      position,
      reasoning,
      confidence: this.clampConfidence(payload.confidence),
      open_questions: this.readOptionalStringArray(payload, "open_questions"),
      responses_to_peers: this.readOptionalPeerResponses(payload),
    };
  }

  async callVote(agent: AgentConfig, messages: ChatMessage[]): Promise<Vote> {
    const client = this.getClient(agent.provider);
    const response = await client.chat.completions.create({
      model: agent.model,
      messages,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    const parsed = this.parseJSON(content);
    const payload = this.toRecord(parsed, "Vote response must be a JSON object");

    return {
      role: agent.role,
      model: agent.model,
      timestamp: new Date().toISOString(),
      chosen_position: this.readString(payload, "chosen_position"),
      rationale: this.readString(payload, "rationale"),
      confidence: this.clampConfidence(payload.confidence),
      dissent_notes: this.readOptionalString(payload, "dissent_notes"),
    };
  }

  private getClient(providerKey: string): OpenAI {
    const cached = this.clients.get(providerKey);
    if (cached) {
      return cached;
    }

    const provider = this.providers[providerKey];
    if (!provider) {
      throw new Error(`Unknown provider: ${providerKey}`);
    }

    const apiKey = process.env[provider.apiKeyEnv];
    if (!apiKey) {
      throw new Error(`Missing API key environment variable: ${provider.apiKeyEnv}`);
    }

    const client = new OpenAI({
      apiKey,
      baseURL: provider.baseURL,
    });

    this.clients.set(providerKey, client);
    return client;
  }

  private parseJSON(content: string | null | undefined): unknown {
    if (!content) {
      throw new Error("Model returned empty response content");
    }

    const stripped = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    try {
      return JSON.parse(stripped);
    } catch {
      throw new Error("Model returned invalid JSON");
    }
  }

  private toRecord(value: unknown, message: string): JsonRecord {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error(message);
    }

    return value as JsonRecord;
  }

  private readString(source: JsonRecord, key: string): string {
    const value = source[key];
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`Missing or invalid ${key}`);
    }

    return value;
  }

  private readOptionalString(source: JsonRecord, key: string): string | undefined {
    const value = source[key];
    if (value === undefined) {
      return undefined;
    }
    if (typeof value !== "string") {
      throw new Error(`Invalid ${key}`);
    }

    return value;
  }

  private readStringArray(source: JsonRecord, key: string): string[] {
    const value = source[key];
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
      throw new Error(`Missing or invalid ${key}`);
    }

    return value;
  }

  private readOptionalStringArray(
    source: JsonRecord,
    key: string,
  ): string[] | undefined {
    const value = source[key];
    if (value === undefined) {
      return undefined;
    }
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
      throw new Error(`Invalid ${key}`);
    }

    return value;
  }

  private readOptionalPeerResponses(source: JsonRecord): Post["responses_to_peers"] {
    const value = source.responses_to_peers;
    if (value === undefined) {
      return undefined;
    }

    if (!Array.isArray(value)) {
      throw new Error("Invalid responses_to_peers");
    }

    const parsed: NonNullable<Post["responses_to_peers"]> = [];
    for (const item of value) {
      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        throw new Error("Invalid responses_to_peers");
      }

      const record = item as JsonRecord;
      const toRole = this.readString(record, "to_role");
      const comment = this.readString(record, "comment");
      const stance = record.stance;

      if (
        stance !== "agree" &&
        stance !== "partially_agree" &&
        stance !== "disagree"
      ) {
        throw new Error("Invalid responses_to_peers stance");
      }

      parsed.push({
        to_role: toRole,
        stance,
        comment,
      });
    }

    return parsed;
  }

  private clampConfidence(value: unknown): number {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return 0;
    }

    return Math.max(0, Math.min(1, value));
  }
}
