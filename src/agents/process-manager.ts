// src/agents/process-manager.ts
// Calls agents via OpenCode HTTP API instead of direct LLM provider calls.

import type { AgentConfig, Post, Vote } from "../blackboard/types.js";
import { OpenCodeHttpClient, type SendMessageOptions } from "./opencode-http-client.js";
import type { BuiltPrompt } from "../moderator/prompt-builder.js";

type JsonRecord = Record<string, unknown>;

export class AgentProcessManager {
  private readonly client: OpenCodeHttpClient;

  constructor(opencodeUrl: string, directory: string) {
    this.client = new OpenCodeHttpClient(opencodeUrl, directory);
  }

  async createSession(): Promise<string> {
    return this.client.createSession();
  }

  async deleteSession(sessionId: string): Promise<void> {
    return this.client.deleteSession(sessionId);
  }

  async callAgent(
    sessionId: string,
    agent: AgentConfig,
    prompt: BuiltPrompt,
    round: number,
    onChunk?: (chunk: string, isComplete: boolean) => void,
  ): Promise<Post> {
    const { providerID, modelID } = this.parseModelId(agent.model);

    const opts: SendMessageOptions = {
      model: { providerID, modelID },
      system: prompt.system,
      // Omit format: json_schema — the lilith provider returns 0 parts with structured output.
      // The system prompt already instructs: "Return ONLY valid JSON."
      // sendMessage() will parse JSON from the text response via extractJsonFromText().
      parts: [{ type: "text", text: prompt.userText }],
    };

    const result = await this.client.sendMessage(sessionId, opts);
    const payload = this.toRecord(this.parseResult(result), "Agent response must be a JSON object");
    const post = this.buildPost(agent, round, payload);

    // onChunk called once with final position (streaming not available over HTTP)
    if (onChunk) {
      onChunk(post.position, true);
    }

    return post;
  }

  async callVote(
    sessionId: string,
    agent: AgentConfig,
    prompt: BuiltPrompt,
  ): Promise<Vote> {
    const { providerID, modelID } = this.parseModelId(agent.model);

    const opts: SendMessageOptions = {
      model: { providerID, modelID },
      system: prompt.system,
      // Omit format: json_schema — same reason as callAgent (lilith provider compatibility).
      parts: [{ type: "text", text: prompt.userText }],
    };

    const result = await this.client.sendMessage(sessionId, opts);
    const payload = this.toRecord(this.parseResult(result), "Vote response must be a JSON object");

    return {
      role: agent.role,
      model: agent.model,
      timestamp: new Date().toISOString(),
      chosen_position: this.readString(payload, "chosen_position"),
      rationale: this.readString(payload, "rationale"),
      confidence: this.clampConfidence(payload["confidence"]),
      dissent_notes: this.readOptionalString(payload, "dissent_notes"),
    };
  }

  private parseModelId(fullModelId: string): { providerID: string; modelID: string } {
    const slashIdx = fullModelId.indexOf("/");
    if (slashIdx === -1) {
      throw new Error(`Invalid model ID "${fullModelId}": must be "provider/model" format`);
    }
    return {
      providerID: fullModelId.slice(0, slashIdx),
      modelID: fullModelId.slice(slashIdx + 1),
    };
  }

  private buildPost(agent: AgentConfig, round: number, payload: JsonRecord): Post {
    return {
      role: agent.role,
      model: agent.model,
      round,
      timestamp: new Date().toISOString(),
      position: this.readString(payload, "position"),
      reasoning: this.readStringArray(payload, "reasoning"),
      confidence: this.clampConfidence(payload["confidence"]),
      open_questions: this.readOptionalStringArray(payload, "open_questions"),
      responses_to_peers: this.readOptionalPeerResponses(payload),
    };
  }

  /**
   * Parse the result from sendMessage() into a JSON object.
   * sendMessage() returns an object when format is specified, or a raw string otherwise.
   * When it's a string, try to extract JSON from it.
   */
  private parseResult(result: unknown): unknown {
    if (typeof result === "string") {
      // Try to extract JSON from the text
      const text = result.trim();
      // Try direct parse
      if (text.startsWith("{") || text.startsWith("[")) {
        try { return JSON.parse(text); } catch { /* fall through */ }
      }
      // Try ```json ... ``` code fence
      const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch?.[1]) {
        try { return JSON.parse(fenceMatch[1].trim()); } catch { /* fall through */ }
      }
      // Try first { ... } block
      const braceStart = text.indexOf("{");
      if (braceStart !== -1) {
        const braceEnd = text.lastIndexOf("}");
        if (braceEnd > braceStart) {
          try { return JSON.parse(text.slice(braceStart, braceEnd + 1)); } catch { /* fall through */ }
        }
      }
      // Couldn't extract JSON — return the string as-is (toRecord will throw with a clear message)
      return result;
    }
    return result;
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
    if (value === undefined) return undefined;
    if (typeof value !== "string") throw new Error(`Invalid ${key}`);
    return value;
  }

  private readStringArray(source: JsonRecord, key: string): string[] {
    const value = source[key];
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
      throw new Error(`Missing or invalid ${key}`);
    }
    return value as string[];
  }

  private readOptionalStringArray(source: JsonRecord, key: string): string[] | undefined {
    const value = source[key];
    if (value === undefined) return undefined;
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
      throw new Error(`Invalid ${key}`);
    }
    return value as string[];
  }

  private readOptionalPeerResponses(source: JsonRecord): Post["responses_to_peers"] {
    const value = source["responses_to_peers"];
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) throw new Error("Invalid responses_to_peers");

    const parsed: NonNullable<Post["responses_to_peers"]> = [];
    for (const item of value) {
      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        throw new Error("Invalid responses_to_peers item");
      }
      const record = item as JsonRecord;
      const toRole = this.readString(record, "to_role");
      const comment = this.readString(record, "comment");
      const stance = record["stance"];
      if (stance !== "agree" && stance !== "partially_agree" && stance !== "disagree") {
        throw new Error("Invalid responses_to_peers stance");
      }
      parsed.push({ to_role: toRole, stance, comment });
    }
    return parsed;
  }

  private clampConfidence(value: unknown): number {
    if (typeof value !== "number" || Number.isNaN(value)) return 0;
    return Math.max(0, Math.min(1, value));
  }
}
