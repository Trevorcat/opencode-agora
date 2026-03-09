import { AgentProcessManager } from "../agents/process-manager.js";
import { BlackboardStore } from "../blackboard/store.js";
import type {
  AgentConfig,
  Post,
  ProviderConfig,
} from "../blackboard/types.js";
import { withRetry, type RetryOptions } from "../resilience/retry.js";
import { withTimeout } from "../resilience/timeout.js";
import { barrierAllSettled } from "../sync/barrier.js";
import {
  buildRound1Prompt,
  buildRoundNPrompt,
  buildVotePrompt,
} from "./prompt-builder.js";

interface ControllerOptions {
  store: BlackboardStore;
  providers: Record<string, ProviderConfig>;
  retryOpts: RetryOptions;
  timeoutMs: number;
}

interface RunDebateParams {
  topicId: string;
  question: string;
  context?: string;
  agents: AgentConfig[];
}

export class DebateController {
  private readonly processManager: AgentProcessManager;
  private readonly store: BlackboardStore;
  private readonly retryOpts: RetryOptions;
  private readonly timeoutMs: number;

  constructor(options: ControllerOptions) {
    this.store = options.store;
    this.retryOpts = options.retryOpts;
    this.timeoutMs = options.timeoutMs;
    this.processManager = new AgentProcessManager(options.providers);
  }

  async runDebate(params: RunDebateParams): Promise<void> {
    const { topicId, question, context, agents } = params;

    await this.store.saveTopic({
      id: topicId,
      question,
      context,
      status: "pending",
      config: {
        max_rounds: 3,
        consensus_threshold: 0.66,
        agents,
      },
      created_at: new Date().toISOString(),
    });

    try {
      await this.store.updateTopicStatus(topicId, "running");

      const allPosts: Post[][] = [];

      for (let round = 1; round <= 3; round++) {
        const prevPosts = round === 1 ? [] : allPosts[round - 2] ?? [];

        const roundTasks = agents.map((agent) => async () => {
          const prompt =
            round === 1
              ? buildRound1Prompt({ agent, question, context })
              : buildRoundNPrompt({
                  agent,
                  question,
                  round,
                  prevPosts,
                  context,
                });

          return this.callWithResilience(`${agent.role}-round-${round}`, () =>
            this.processManager.callAgent(agent, prompt, round),
          );
        });

        const settledPosts = await barrierAllSettled(roundTasks, agents.map((agent) => agent.role));

        const successfulPosts: Post[] = [];
        for (const result of settledPosts) {
          if (result.status === "fulfilled" && result.value) {
            successfulPosts.push(result.value);
            await this.store.savePost(topicId, round, result.value);
          }
        }

        if (successfulPosts.length === 0) {
          throw new Error(`All agents failed in round ${round}`);
        }

        allPosts.push(successfulPosts);
      }

      const voteTasks = agents.map((agent) => async () => {
        const prompt = buildVotePrompt({
          agent,
          question,
          allPosts,
        });

        return this.callWithResilience(`${agent.role}-vote`, () =>
          this.processManager.callVote(agent, prompt),
        );
      });

      const settledVotes = await barrierAllSettled(voteTasks, agents.map((agent) => agent.role));

      for (const result of settledVotes) {
        if (result.status === "fulfilled" && result.value) {
          await this.store.saveVote(topicId, result.value);
        }
      }

      await this.store.updateTopicStatus(topicId, "completed");
    } catch (error) {
      await this.store.updateTopicStatus(topicId, "failed");
      throw error;
    }
  }

  private async callWithResilience<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
    return withRetry(() => withTimeout(fn, { timeoutMs: this.timeoutMs, label }), {
      ...this.retryOpts,
      skip: true,
      onSkip: (e) => console.error(`[SKIP] ${label}: ${e.message}`),
    });
  }
}

export type { ControllerOptions, RunDebateParams };
