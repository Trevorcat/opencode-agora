// src/consensus/synthesizer.ts
// Synthesizes debate consensus using OpenCode HTTP API.

import type { Consensus, Post, Vote } from "../blackboard/types.js";
import { OpenCodeHttpClient } from "../agents/opencode-http-client.js";
import { CONSENSUS_SCHEMA } from "../agents/json-schemas.js";

interface SynthesizerOptions {
  opencodeUrl: string;
  directory: string;
  /** Fully qualified model ID, e.g. "lilith/claude-opus-4-6" */
  moderatorModel: string;
}

interface SynthesizeParams {
  topicId: string;
  question: string;
  votes: Vote[];
  allPosts: Post[][];
  roundsTaken: number;
}

type JsonRecord = Record<string, unknown>;

export class ConsensusSynthesizer {
  private readonly opencodeUrl: string;
  private readonly directory: string;
  private readonly moderatorModel: string;

  constructor(options: SynthesizerOptions) {
    this.opencodeUrl = options.opencodeUrl;
    this.directory = options.directory;
    this.moderatorModel = options.moderatorModel;
  }

  async synthesize(params: SynthesizeParams): Promise<Consensus> {
    const voteDistribution = this.computeVoteDistribution(params.votes);

    // Try LLM synthesis first; fall back to vote-based synthesis on any failure
    try {
      return await this.synthesizeWithLLM(params, voteDistribution);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[consensus] LLM synthesis failed (${msg}), using vote-based fallback`);
      return this.synthesizeFromVotes(params, voteDistribution);
    }
  }

  private async synthesizeWithLLM(
    params: SynthesizeParams,
    voteDistribution: Record<string, number>,
  ): Promise<Consensus> {
    const client = new OpenCodeHttpClient(this.opencodeUrl, this.directory);
    const sessionId = await client.createSession();
    const { providerID, modelID } = this.parseModelId(this.moderatorModel);

    let result: unknown;
    try {
      result = await client.sendMessage(sessionId, {
        model: { providerID, modelID },
        system: this.buildSystemPrompt(),
        format: { type: "json_schema", schema: CONSENSUS_SCHEMA },
        parts: [{ type: "text", text: this.buildUserPrompt(params, voteDistribution) }],
      });
    } finally {
      void client.deleteSession(sessionId);
    }

    const payload = this.toRecord(result, "Moderator model response must be a JSON object");

    return {
      topic_id: params.topicId,
      conclusion: this.readString(payload, "conclusion"),
      confidence: this.readNumber(payload, "confidence"),
      key_arguments: this.readStringArray(payload, "key_arguments"),
      dissenting_views: this.readStringArray(payload, "dissenting_views"),
      convergence_method: this.readString(payload, "convergence_method"),
      vote_distribution: voteDistribution,
      rounds_taken: params.roundsTaken,
      generated_by: this.moderatorModel,
    };
  }

  /**
   * Fallback: build consensus directly from votes without calling LLM.
   * Used when the moderator model is unavailable or returns invalid JSON.
   */
  private synthesizeFromVotes(
    params: SynthesizeParams,
    voteDistribution: Record<string, number>,
  ): Consensus {
    // Pick the position with the most votes; tie-break by first occurrence
    const topPosition =
      Object.entries(voteDistribution).sort(([, a], [, b]) => b - a)[0]?.[0] ??
      "No consensus reached";

    const totalVotes = params.votes.length;
    const topVotes = voteDistribution[topPosition] ?? 0;
    const confidence = totalVotes > 0 ? topVotes / totalVotes : 0;

    // Collect unique reasoning points from the last round
    const lastRoundPosts = params.allPosts[params.allPosts.length - 1] ?? [];
    const key_arguments = lastRoundPosts
      .flatMap((p) => p.reasoning ?? [])
      .filter((r): r is string => typeof r === "string" && r.trim().length > 0)
      .slice(0, 5);

    const dissenting_views = params.votes
      .filter((v) => v.chosen_position !== topPosition && v.dissent_notes)
      .map((v) => v.dissent_notes as string)
      .slice(0, 3);

    return {
      topic_id: params.topicId,
      conclusion: topPosition,
      confidence,
      key_arguments,
      dissenting_views,
      convergence_method: "vote-majority (fallback)",
      vote_distribution: voteDistribution,
      rounds_taken: params.roundsTaken,
      generated_by: "fallback",
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

  private computeVoteDistribution(votes: Vote[]): Record<string, number> {
    return votes.reduce<Record<string, number>>((distribution, vote) => {
      distribution[vote.chosen_position] = (distribution[vote.chosen_position] ?? 0) + 1;
      return distribution;
    }, {});
  }

  private buildSystemPrompt(): string {
    return [
      "You are the Agora Moderator. Synthesize the debate into a structured consensus.",
      "Analyze votes, debate history, and key arguments to produce a comprehensive summary.",
    ].join("\n\n");
  }

  private buildUserPrompt(
    params: SynthesizeParams,
    voteDistribution: Record<string, number>,
  ): string {
    const voteSummary = params.votes.length
      ? params.votes
          .map(
            (vote, index) =>
              `${index + 1}. ${vote.role} (${vote.model}) -> ${vote.chosen_position} | confidence=${vote.confidence} | rationale=${vote.rationale}`,
          )
          .join("\n")
      : "No votes provided.";

    const debateHistory = params.allPosts.length
      ? params.allPosts
          .map((posts, roundIndex) => {
            const header = `Round ${roundIndex + 1}`;
            const body = posts.length
              ? posts
                  .map(
                    (post, postIndex) =>
                      `Post ${postIndex + 1}: ${post.role} (${post.model}) | position=${post.position} | confidence=${post.confidence}\nReasoning: ${post.reasoning.join("; ")}`,
                  )
                  .join("\n")
              : "No posts recorded.";
            return `${header}\n${body}`;
          })
          .join("\n\n")
      : "No debate history provided.";

    return [
      `Question: ${params.question}`,
      `Rounds taken: ${params.roundsTaken}`,
      "Vote summary:",
      voteSummary,
      "Vote distribution:",
      JSON.stringify(voteDistribution),
      "Debate history:",
      debateHistory,
    ].join("\n\n");
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

  private readNumber(source: JsonRecord, key: string): number {
    const value = source[key];
    if (typeof value !== "number" || Number.isNaN(value)) {
      throw new Error(`Missing or invalid ${key}`);
    }
    return value;
  }

  private readStringArray(source: JsonRecord, key: string): string[] {
    const value = source[key];
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
      throw new Error(`Missing or invalid ${key}`);
    }
    return value as string[];
  }
}

export type { SynthesizeParams, SynthesizerOptions };
