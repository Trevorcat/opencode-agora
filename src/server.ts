import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import crypto from "node:crypto";
import { z } from "zod";

import { getDefaultAgents } from "./agents/default-personas.js";
import { BlackboardStore } from "./blackboard/store.js";
import type {
  AgentConfig,
  DebateStatus,
  ProgressEvent,
  ResolvedProvider,
  Topic,
} from "./blackboard/types.js";
import { ConsensusSynthesizer } from "./consensus/synthesizer.js";
import { DebateController } from "./moderator/controller.js";

interface ServerOptions {
  store: BlackboardStore;
  agoraDir: string;
  providers: Map<string, ResolvedProvider>;
  /** Fully qualified moderator model ID, e.g. "lilith/claude-opus-4-6" */
  moderatorModel: string;
  /** Optional callback for progress notifications */
  onProgress?: (event: ProgressEvent) => void | Promise<void>;
}

interface RunningDebate {
  topicId: string;
  controller: DebateController;
  promise: Promise<void>;
  abort: () => void;
}

function generateTopicId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = crypto.randomBytes(3).toString("hex");
  return `topic_${date}_${rand}`;
}

function toToolResult(data: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    ...(isError ? { isError: true as const } : {}),
  };
}

async function setTopicMetadata(
  store: BlackboardStore,
  topicId: string,
  status: DebateStatus,
  completedAt?: string,
): Promise<void> {
  const topic = await store.getTopic(topicId);
  if (!topic) {
    return;
  }

  await store.saveTopic({
    ...topic,
    status,
    ...(completedAt ? { completed_at: completedAt } : {}),
  });
}

export function createAgoraServer(opts: ServerOptions): McpServer {
  const { store, providers, moderatorModel, onProgress } = opts;

  // Track running async debates
  const runningDebates = new Map<string, RunningDebate>();

  const server = new McpServer({
    name: "opencode-agora",
    version: "0.1.0",
  });

  // Helper to create a controller with progress notification
  function createController(): DebateController {
    return new DebateController({
      store,
      providers,
      retryOpts: {
        maxAttempts: 3,
        baseDelayMs: 1_000,
      },
      timeoutMs: 60_000,
      onProgress: async (event) => {
        // Forward to server-level handler
        if (onProgress) {
          await onProgress(event);
        }
        // Also broadcast to attached sessions
        const sessions = await store.getAttachedSessions(event.topic_id);
        // In a real implementation, we'd send notifications to each session
        console.log(`[Agora] ${event.type}: ${event.topic_id}`);
      },
    });
  }

  server.tool(
    "forum.start_debate",
    "Start a 3-round multi-agent forum debate and synthesize consensus (blocking, returns when complete)",
    {
      question: z.string().min(1),
      context: z.string().optional(),
      agents: z
        .array(
          z.object({
            role: z.string().min(1),
            persona: z.string().min(1),
            model: z.string().min(1),
          }),
        )
        .optional(),
    },
    async ({ question, context, agents }) => {
      const topicId = generateTopicId();

      try {
        const panel = agents ?? getDefaultAgents();

        const topic: Topic = {
          id: topicId,
          question,
          ...(context ? { context } : {}),
          status: "pending",
          config: {
            max_rounds: 3,
            consensus_threshold: 0.66,
            agents: panel,
          },
          created_at: new Date().toISOString(),
        };

        await store.saveTopic(topic);

        const controller = createController();

        await controller.runDebate({
          topicId,
          question,
          context,
          agents: panel,
          enablePause: false,
          enableGuidance: false,
        });

        const votes = await store.getVotes(topicId);
        const allPosts = await Promise.all([1, 2, 3].map((round) => store.getRoundPosts(topicId, round)));

        const synthesizer = new ConsensusSynthesizer({
          providers,
          moderatorModel,
        });

        const consensus = await synthesizer.synthesize({
          topicId,
          question,
          votes,
          allPosts,
          roundsTaken: 3,
        });

        await store.saveConsensus(topicId, consensus);
        await setTopicMetadata(store, topicId, "completed", new Date().toISOString());

        // Pin consensus to blackboard
        await controller.pinToBlackboard(topicId, consensus.conclusion, "consensus", {
          metadata: { confidence: consensus.confidence },
        });

        return toToolResult({
          topicId,
          status: "completed",
          consensus,
        });
      } catch (error) {
        await setTopicMetadata(store, topicId, "failed");

        return toToolResult(
          {
            topicId,
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
          },
          true,
        );
      }
    },
  );

  server.tool(
    "forum.start_debate_async",
    "Start a 3-round debate asynchronously (returns immediately, monitor with get_live_status)",
    {
      question: z.string().min(1),
      context: z.string().optional(),
      agents: z
        .array(
          z.object({
            role: z.string().min(1),
            persona: z.string().min(1),
            model: z.string().min(1),
          }),
        )
        .optional(),
      pause_after_rounds: z.array(z.number().int().min(1).max(3)).optional()
        .describe("Automatically pause after these round numbers"),
    },
    async ({ question, context, agents, pause_after_rounds }) => {
      const topicId = generateTopicId();

      try {
        const panel = agents ?? getDefaultAgents();

        const topic: Topic = {
          id: topicId,
          question,
          ...(context ? { context } : {}),
          status: "pending",
          config: {
            max_rounds: 3,
            consensus_threshold: 0.66,
            agents: panel,
          },
          created_at: new Date().toISOString(),
        };

        await store.saveTopic(topic);

        const controller = createController();

        // Store running debate
        const { promise, abort } = controller.runDebateAsync({
          topicId,
          question,
          context,
          agents: panel,
          enablePause: true,
          enableGuidance: true,
        });

        runningDebates.set(topicId, {
          topicId,
          controller,
          promise,
          abort,
        });

        // Clean up when done
        promise
          .then(async () => {
            // Generate consensus
            const votes = await store.getVotes(topicId);
            const allPosts = await Promise.all([1, 2, 3].map((round) => store.getRoundPosts(topicId, round)));

            const synthesizer = new ConsensusSynthesizer({
              providers,
              moderatorModel,
            });

            const consensus = await synthesizer.synthesize({
              topicId,
              question,
              votes,
              allPosts,
              roundsTaken: 3,
            });

            await store.saveConsensus(topicId, consensus);
            await setTopicMetadata(store, topicId, "completed", new Date().toISOString());
            await controller.pinToBlackboard(topicId, consensus.conclusion, "consensus", {
              metadata: { confidence: consensus.confidence },
            });

            runningDebates.delete(topicId);
          })
          .catch((error) => {
            console.error(`[Agora] Debate ${topicId} failed:`, error);
            setTopicMetadata(store, topicId, "failed");
            runningDebates.delete(topicId);
          });

        return toToolResult({
          topicId,
          status: "started",
          message: "Debate started asynchronously. Use forum.get_live_status to monitor.",
        });
      } catch (error) {
        return toToolResult(
          {
            topicId,
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
          },
          true,
        );
      }
    },
  );

  server.tool(
    "forum.get_live_status",
    "Get real-time debate status including current round, agent states, and blackboard",
    {
      topic_id: z.string().min(1),
    },
    async ({ topic_id: topicId }) => {
      const status = await store.getLiveStatus(topicId);
      if (!status) {
        return toToolResult({ topicId, error: "Topic not found" }, true);
      }

      return toToolResult(status);
    },
  );

  server.tool(
    "forum.get_blackboard",
    "Get the shared blackboard content for a topic",
    {
      topic_id: z.string().min(1),
    },
    async ({ topic_id: topicId }) => {
      const topic = await store.getTopic(topicId);
      if (!topic) {
        return toToolResult({ topicId, error: "Topic not found" }, true);
      }

      const blackboard = await store.getBlackboard(topicId);
      return toToolResult({
        topicId,
        blackboard,
        pinned_items: blackboard.filter((item) => item.pinned),
      });
    },
  );

  server.tool(
    "forum.pause_debate",
    "Pause a running debate before the next agent or round",
    {
      topic_id: z.string().min(1),
      reason: z.string().optional(),
    },
    async ({ topic_id: topicId, reason }) => {
      const running = runningDebates.get(topicId);
      if (!running) {
        // Try to pause anyway (might be in sync mode)
        await store.setPauseState(topicId, true, reason);
        return toToolResult({ topicId, status: "paused", message: "Debate pause requested" });
      }

      await running.controller.pauseDebate(topicId, reason);
      return toToolResult({ topicId, status: "paused", reason });
    },
  );

  server.tool(
    "forum.resume_debate",
    "Resume a paused debate",
    {
      topic_id: z.string().min(1),
    },
    async ({ topic_id: topicId }) => {
      const running = runningDebates.get(topicId);
      if (!running) {
        await store.setPauseState(topicId, false);
        return toToolResult({ topicId, status: "resumed", message: "Debate resume requested" });
      }

      await running.controller.resumeDebate(topicId);
      return toToolResult({ topicId, status: "resumed" });
    },
  );

  server.tool(
    "forum.inject_guidance",
    "Inject human guidance into a running debate",
    {
      topic_id: z.string().min(1),
      guidance: z.string().min(1).describe("The guidance content to inject"),
      target_round: z.number().int().min(1).max(3).optional()
        .describe("Only show this guidance in this round (omit for all rounds)"),
      target_agents: z.array(z.string()).optional()
        .describe("Only show to these agent roles (omit for all agents)"),
      pin_to_blackboard: z.boolean().default(false)
        .describe("Also pin this guidance to the shared blackboard"),
    },
    async ({ topic_id: topicId, guidance, target_round, target_agents, pin_to_blackboard }) => {
      const topic = await store.getTopic(topicId);
      if (!topic) {
        return toToolResult({ topicId, error: "Topic not found" }, true);
      }

      const running = runningDebates.get(topicId);
      const controller = running?.controller ?? createController();

      await controller.injectGuidance(topicId, guidance, {
        targetRound: target_round,
        targetAgents: target_agents,
        pinToBlackboard: pin_to_blackboard,
      });

      return toToolResult({
        topicId,
        status: "guidance_added",
        message: "Guidance will be shown to agents in the next turn",
      });
    },
  );

  server.tool(
    "forum.pin_to_blackboard",
    "Pin a consensus item or note to the shared blackboard",
    {
      topic_id: z.string().min(1),
      content: z.string().min(1),
      type: z.enum(["consensus", "checkpoint", "note"]),
      editable: z.boolean().default(false),
    },
    async ({ topic_id: topicId, content, type, editable }) => {
      const topic = await store.getTopic(topicId);
      if (!topic) {
        return toToolResult({ topicId, error: "Topic not found" }, true);
      }

      const running = runningDebates.get(topicId);
      const controller = running?.controller ?? createController();

      await controller.pinToBlackboard(topicId, content, type, { editable });

      return toToolResult({
        topicId,
        status: "pinned",
        type,
        content,
      });
    },
  );

  server.tool(
    "forum.attach_to_topic",
    "Attach a session to monitor a topic's progress notifications",
    {
      topic_id: z.string().min(1),
      session_id: z.string().min(1),
    },
    async ({ topic_id: topicId, session_id: sessionId }) => {
      const topic = await store.getTopic(topicId);
      if (!topic) {
        return toToolResult({ topicId, error: "Topic not found" }, true);
      }

      const running = runningDebates.get(topicId);
      const controller = running?.controller ?? createController();

      await controller.attachToTopic(topicId, sessionId);

      return toToolResult({
        topicId,
        sessionId,
        status: "attached",
        message: "Session attached. Progress notifications will be sent.",
      });
    },
  );

  server.tool(
    "forum.detach_from_topic",
    "Detach a session from monitoring a topic",
    {
      topic_id: z.string().min(1),
      session_id: z.string().min(1),
    },
    async ({ topic_id: topicId, session_id: sessionId }) => {
      const running = runningDebates.get(topicId);
      const controller = running?.controller ?? createController();

      await controller.detachFromTopic(topicId, sessionId);

      return toToolResult({
        topicId,
        sessionId,
        status: "detached",
      });
    },
  );

  server.tool(
    "forum.get_status",
    "Get debate topic status and metadata",
    {
      topic_id: z.string().min(1),
    },
    async ({ topic_id: topicId }) => {
      const topic = await store.getTopic(topicId);
      if (!topic) {
        return toToolResult({ topicId, error: "Topic not found" }, true);
      }

      return toToolResult({
        id: topic.id,
        question: topic.question,
        status: topic.status,
        created_at: topic.created_at,
        completed_at: topic.completed_at,
      });
    },
  );

  server.tool(
    "forum.get_round",
    "Get all posts for a debate round",
    {
      topic_id: z.string().min(1),
      round: z.number().int().min(1).max(3),
    },
    async ({ topic_id: topicId, round }) => {
      const posts = await store.getRoundPosts(topicId, round);
      if (posts.length === 0) {
        return toToolResult(
          {
            topicId,
            round,
            error: "No posts found for this round",
          },
          true,
        );
      }

      return toToolResult({
        topicId,
        round,
        posts,
      });
    },
  );

  server.tool(
    "forum.get_consensus",
    "Get synthesized consensus for a topic",
    {
      topic_id: z.string().min(1),
    },
    async ({ topic_id: topicId }) => {
      const consensus = await store.getConsensus(topicId);
      if (!consensus) {
        return toToolResult({ topicId, error: "Consensus not found" }, true);
      }

      return toToolResult(consensus);
    },
  );

  server.tool(
    "forum.list_topics",
    "List all known debate topics",
    {},
    async () => {
      const topicIds = await store.listTopics();
      const summaries = await Promise.all(
        topicIds.map(async (topicId) => {
          const topic = await store.getTopic(topicId);
          if (!topic) {
            return null;
          }

          return {
            id: topic.id,
            question: topic.question,
            status: topic.status,
            created_at: topic.created_at,
            completed_at: topic.completed_at,
          };
        }),
      );

      return toToolResult({
        topics: summaries.filter((summary) => summary !== null),
      });
    },
  );

  return server;
}

export type { ServerOptions };
export type { ProgressEvent } from "./blackboard/types.js";
