import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import crypto from "node:crypto";
import { z } from "zod";

import { getDefaultAgents } from "./agents/default-personas.js";
import { BlackboardStore } from "./blackboard/store.js";
import type {
  AgentConfig,
  DebateStatus,
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
  const { store, providers, moderatorModel } = opts;

  const server = new McpServer({
    name: "opencode-agora",
    version: "0.1.0",
  });

  server.tool(
    "forum.start_debate",
    "Start a 3-round multi-agent forum debate and synthesize consensus",
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

        const controller = new DebateController({
          store,
          providers,
          retryOpts: {
            maxAttempts: 3,
            baseDelayMs: 1_000,
          },
          timeoutMs: 60_000,
        });

        await controller.runDebate({
          topicId,
          question,
          context,
          agents: panel,
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
