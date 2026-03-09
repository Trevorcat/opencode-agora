import { AgentProcessManager } from "../agents/process-manager.js";
import { BlackboardStore } from "../blackboard/store.js";
import type {
  AgentConfig,
  BlackboardItem,
  Guidance,
  Post,
  ProgressEvent,
  ResolvedProvider,
  Vote,
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
  providers: Map<string, ResolvedProvider>;
  retryOpts: RetryOptions;
  timeoutMs: number;
  /** Optional callback for progress notifications */
  onProgress?: (event: ProgressEvent) => void | Promise<void>;
}

interface RunDebateParams {
  topicId: string;
  question: string;
  context?: string;
  agents: AgentConfig[];
  /** If true, check for pause before each agent and between rounds */
  enablePause?: boolean;
  /** If true, inject pending guidance into prompts */
  enableGuidance?: boolean;
}

interface RunDebateAsyncResult {
  topicId: string;
  promise: Promise<void>;
  abort: () => void;
}

export class DebateController {
  private readonly processManager: AgentProcessManager;
  private readonly store: BlackboardStore;
  private readonly retryOpts: RetryOptions;
  private readonly timeoutMs: number;
  private readonly onProgress?: (event: ProgressEvent) => void | Promise<void>;
  private abortControllers = new Map<string, AbortController>();

  constructor(options: ControllerOptions) {
    this.store = options.store;
    this.retryOpts = options.retryOpts;
    this.timeoutMs = options.timeoutMs;
    this.onProgress = options.onProgress;
    this.processManager = new AgentProcessManager(options.providers);
  }

  /**
   * Run debate synchronously (blocking until completion)
   */
  async runDebate(params: RunDebateParams): Promise<void> {
    const { topicId, question, context, agents, enablePause = false, enableGuidance = false } = params;

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

    // Initialize empty blackboard
    await this.notifyProgress({
      type: "debate_started",
      topic_id: topicId,
      question,
      timestamp: new Date().toISOString(),
    });

    const abortController = new AbortController();
    this.abortControllers.set(topicId, abortController);

    try {
      await this.store.updateTopicStatus(topicId, "running");
      const allPosts: Post[][] = [];

      for (let round = 1; round <= 3; round++) {
        // Check pause before round
        if (enablePause) {
          await this.waitIfPaused(topicId, round);
          if (abortController.signal.aborted) {
            throw new Error("Debate aborted");
          }
        }

        await this.notifyProgress({
          type: "round_started",
          topic_id: topicId,
          round,
          timestamp: new Date().toISOString(),
        });

        const prevPosts = round === 1 ? [] : allPosts[round - 2] ?? [];

        // Get pending guidance for this round
        const guidance = enableGuidance ? await this.store.getPendingGuidance(topicId, round) : [];

        const roundTasks = agents.map((agent) => async () => {
          // Check pause before each agent
          if (enablePause) {
            await this.waitIfPaused(topicId, round);
          }

          await this.notifyProgress({
            type: "agent_thinking",
            topic_id: topicId,
            round,
            agent: agent.role,
            model: agent.model,
            timestamp: new Date().toISOString(),
          });

          const prompt =
            round === 1
              ? buildRound1Prompt({ agent, question, context, guidance })
              : buildRoundNPrompt({
                  agent,
                  question,
                  round,
                  prevPosts,
                  context,
                  guidance,
                });

          try {
            const post = await this.callWithResilience(`${agent.role}-round-${round}`, () =>
              this.processManager.callAgent(agent, prompt, round),
            );

            if (post) {
              await this.store.savePost(topicId, round, post);
              
              // Mark guidance as consumed if it was targeted at this agent
              if (enableGuidance) {
                await this.consumeTargetedGuidance(topicId, guidance, agent.role);
              }

              await this.notifyProgress({
                type: "agent_posted",
                topic_id: topicId,
                round,
                post,
                timestamp: new Date().toISOString(),
              });

              return post;
            }
          } catch (error) {
            await this.notifyProgress({
              type: "agent_error",
              topic_id: topicId,
              round,
              agent: agent.role,
              error: error instanceof Error ? error.message : String(error),
              timestamp: new Date().toISOString(),
            });
            throw error;
          }
          return null;
        });

        const settledPosts = await barrierAllSettled(roundTasks, agents.map((agent) => agent.role));

        const successfulPosts: Post[] = [];
        for (const result of settledPosts) {
          if (result.status === "fulfilled" && result.value) {
            successfulPosts.push(result.value);
          }
        }

        if (successfulPosts.length === 0) {
          throw new Error(`All agents failed in round ${round}`);
        }

        allPosts.push(successfulPosts);

        await this.notifyProgress({
          type: "round_complete",
          topic_id: topicId,
          round,
          posts: successfulPosts,
          timestamp: new Date().toISOString(),
        });
      }

      await this.notifyProgress({
        type: "voting_started",
        topic_id: topicId,
        timestamp: new Date().toISOString(),
      });

      // Voting phase
      const voteTasks = agents.map((agent) => async () => {
        const prompt = buildVotePrompt({
          agent,
          question,
          allPosts,
        });

        const vote = await this.callWithResilience(`${agent.role}-vote`, () =>
          this.processManager.callVote(agent, prompt),
        );

        if (vote) {
          await this.store.saveVote(topicId, vote);
          await this.notifyProgress({
            type: "vote_cast",
            topic_id: topicId,
            vote,
            timestamp: new Date().toISOString(),
          });
        }

        return vote;
      });

      await barrierAllSettled(voteTasks, agents.map((agent) => agent.role));

      await this.store.updateTopicStatus(topicId, "completed");

      await this.notifyProgress({
        type: "debate_complete",
        topic_id: topicId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      await this.store.updateTopicStatus(topicId, "failed");
      await this.notifyProgress({
        type: "error",
        topic_id: topicId,
        message: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });
      throw error;
    } finally {
      this.abortControllers.delete(topicId);
    }
  }

  /**
   * Start debate asynchronously (returns immediately with abort control)
   */
  runDebateAsync(params: RunDebateParams): RunDebateAsyncResult {
    const abortController = new AbortController();
    const { topicId } = params;
    
    // Override with abort-aware params
    const abortableParams = {
      ...params,
      enablePause: true,
      enableGuidance: true,
    };

    const promise = this.runDebate(abortableParams).catch((error) => {
      if (error.message === "Debate aborted") {
        console.log(`[Agora] Debate ${topicId} was aborted`);
        return;
      }
      throw error;
    });

    return {
      topicId,
      promise,
      abort: () => {
        abortController.abort();
        this.abortControllers.delete(topicId);
      },
    };
  }

  /**
   * Pause debate before next round/agent
   */
  async pauseDebate(topicId: string, reason?: string): Promise<void> {
    await this.store.setPauseState(topicId, true, reason);
    
    // Get current round
    const status = await this.store.getLiveStatus(topicId);
    
    await this.notifyProgress({
      type: "paused",
      topic_id: topicId,
      round: status?.current_round ?? 0,
      reason,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Resume paused debate
   */
  async resumeDebate(topicId: string): Promise<void> {
    await this.store.setPauseState(topicId, false);
    await this.notifyProgress({
      type: "resumed",
      topic_id: topicId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Inject human guidance into the debate
   */
  async injectGuidance(
    topicId: string,
    content: string,
    options?: {
      targetRound?: number;
      targetAgents?: string[];
      pinToBlackboard?: boolean;
    },
  ): Promise<void> {
    const guidance: Guidance = {
      id: `guidance_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      content,
      timestamp: new Date().toISOString(),
      consumed: false,
      target_round: options?.targetRound,
      target_agents: options?.targetAgents,
    };

    await this.store.addGuidance(topicId, guidance);

    // Optionally pin to blackboard
    if (options?.pinToBlackboard) {
      const blackboardItem: BlackboardItem = {
        id: `bb_${guidance.id}`,
        type: "guidance",
        content,
        author: "human",
        timestamp: new Date().toISOString(),
        round: options?.targetRound ?? 0,
        pinned: true,
        editable: true,
        metadata: {
          target_agents: options?.targetAgents,
        },
      };
      await this.store.saveBlackboardItem(topicId, blackboardItem);

      await this.notifyProgress({
        type: "blackboard_updated",
        topic_id: topicId,
        item: blackboardItem,
        timestamp: new Date().toISOString(),
      });
    }

    await this.notifyProgress({
      type: "guidance_added",
      topic_id: topicId,
      guidance,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Pin consensus or checkpoint to blackboard
   */
  async pinToBlackboard(
    topicId: string,
    content: string,
    type: BlackboardItem["type"],
    options?: {
      editable?: boolean;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    const status = await this.store.getLiveStatus(topicId);
    
    const item: BlackboardItem = {
      id: `bb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type,
      content,
      author: "moderator",
      timestamp: new Date().toISOString(),
      round: status?.current_round ?? 0,
      pinned: true,
      editable: options?.editable ?? false,
      metadata: options?.metadata,
    };

    await this.store.saveBlackboardItem(topicId, item);

    await this.notifyProgress({
      type: "blackboard_updated",
      topic_id: topicId,
      item,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Update a blackboard item
   */
  async updateBlackboardItem(
    topicId: string,
    itemId: string,
    updates: Partial<BlackboardItem>,
  ): Promise<void> {
    await this.store.updateBlackboardItem(topicId, itemId, updates);
  }

  /**
   * Attach a monitoring session to a topic
   */
  async attachToTopic(topicId: string, sessionId: string): Promise<void> {
    await this.store.attachSession(topicId, sessionId);
  }

  /**
   * Detach a monitoring session
   */
  async detachFromTopic(topicId: string, sessionId: string): Promise<void> {
    await this.store.detachSession(topicId, sessionId);
  }

  private async notifyProgress(event: ProgressEvent): Promise<void> {
    if (this.onProgress) {
      try {
        await this.onProgress(event);
      } catch (error) {
        console.error("[Agora] Progress notification failed:", error);
      }
    }
  }

  private async waitIfPaused(topicId: string, round: number): Promise<void> {
    while (await this.store.isPaused(topicId)) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  private async consumeTargetedGuidance(
    topicId: string,
    guidanceList: Guidance[],
    agentRole: string,
  ): Promise<void> {
    for (const guidance of guidanceList) {
      if (guidance.target_agents?.includes(agentRole)) {
        await this.store.markGuidanceConsumed(topicId, guidance.id);
      }
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

export type { ControllerOptions, RunDebateParams, RunDebateAsyncResult };
