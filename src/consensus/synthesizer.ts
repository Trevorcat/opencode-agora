import OpenAI from "openai";

import type {
  Consensus,
  Post,
  ResolvedProvider,
  Vote,
} from "../blackboard/types.js";
import { resolveModelProvider } from "../config/opencode-loader.js";

interface SynthesizerOptions {
  providers: Map<string, ResolvedProvider>;
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
  private readonly client: OpenAI;
  private readonly modelName: string;

  constructor(private readonly options: SynthesizerOptions) {
    const { provider, modelName } = resolveModelProvider(
      options.moderatorModel,
      options.providers,
    );
    this.modelName = modelName;

    this.client = new OpenAI({
      baseURL: provider.baseURL,
      apiKey: provider.apiKey,
    });
  }

  async synthesize(params: SynthesizeParams): Promise<Consensus> {
    const voteDistribution = this.computeVoteDistribution(params.votes);
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(params, voteDistribution);

    const response = await this.client.chat.completions.create({
      model: this.modelName,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    const payload = this.parseJsonObject(content);

    return {
      topic_id: params.topicId,
      conclusion: this.readString(payload, "conclusion"),
      confidence: this.readNumber(payload, "confidence"),
      key_arguments: this.readStringArray(payload, "key_arguments"),
      dissenting_views: this.readStringArray(payload, "dissenting_views"),
      convergence_method: this.readString(payload, "convergence_method"),
      vote_distribution: voteDistribution,
      rounds_taken: params.roundsTaken,
      generated_by: this.options.moderatorModel,
    };
  }

  private computeVoteDistribution(votes: Vote[]): Record<string, number> {
    return votes.reduce<Record<string, number>>((distribution, vote) => {
      distribution[vote.chosen_position] = (distribution[vote.chosen_position] ?? 0) + 1;
      return distribution;
    }, {});
  }

  private buildSystemPrompt(): string {
    const schema = `{
  "conclusion": "string",
  "confidence": 0.0,
  "key_arguments": ["string"],
  "dissenting_views": ["string"],
  "convergence_method": "string"
}`;

    return [
      "You are the Agora Moderator. Synthesize the debate.",
      "Return ONLY valid JSON matching this schema:",
      schema,
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

  private parseJsonObject(content: string | null | undefined): JsonRecord {
    if (!content) {
      throw new Error("Moderator model returned empty response content");
    }

    const stripped = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripped);
    } catch {
      throw new Error("Moderator model returned invalid JSON");
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("Moderator model response must be a JSON object");
    }

    return parsed as JsonRecord;
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
    return value;
  }
}

export type { SynthesizeParams, SynthesizerOptions };
