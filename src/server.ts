import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import crypto from "node:crypto";
import { z } from "zod";

import { getDefaultAgents, loadAgentConfig } from "./agents/default-personas.js";
import { BlackboardStore } from "./blackboard/store.js";
import type {
  AgentConfig,
  DebateStatus,
  ProgressEvent,
  Topic,
} from "./blackboard/types.js";
import { ConsensusSynthesizer } from "./consensus/synthesizer.js";
import { DebateController } from "./moderator/controller.js";
import {
  listPresets,
  resolvePreset,
  resolveAgentsWithDefaults,
  savePreset,
} from "./config/presets.js";
import type { AvailableModel } from "./config/opencode-loader.js";

interface ServerOptions {
  store: BlackboardStore;
  agoraDir: string;
  opencodeUrl: string;
  directory: string;
  /** Fully qualified moderator model ID, e.g. "lilith/claude-opus-4-6" */
  moderatorModel: string;
  /** Available models from OpenCode config for list_models tool */
  availableModels: AvailableModel[];
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

/**
 * Best-effort: notify the OpenCode TUI via its HTTP API.
 * Failures are silently ignored — TUI may not be running (e.g. opencode run headless mode).
 */
async function notifyTui(
  opencodeUrl: string,
  opts: {
    toast?: { title: string; message: string; variant?: "info" | "success" | "warning" | "error"; duration?: number };
    appendPrompt?: string;
  },
): Promise<void> {
  try {
    if (opts.toast) {
      await fetch(`${opencodeUrl}/tui/show-toast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: opts.toast.title,
          message: opts.toast.message,
          variant: opts.toast.variant ?? "info",
          duration: opts.toast.duration ?? 5000,
        }),
        signal: AbortSignal.timeout(3000),
      }).catch(() => {});
    }
    if (opts.appendPrompt) {
      await fetch(`${opencodeUrl}/tui/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "tui.prompt.append",
          properties: { text: opts.appendPrompt },
        }),
        signal: AbortSignal.timeout(3000),
      }).catch(() => {});
    }
  } catch {
    // ignore — TUI is optional
  }
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
  const { store, agoraDir, opencodeUrl, directory, moderatorModel, availableModels, onProgress } = opts;

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
      opencodeUrl,
      directory,
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
    "forum.start_debate_async",
    "Start a 3-round debate asynchronously (returns immediately, monitor with get_live_status)",
    {
      question: z.string().min(1),
      context: z.string().optional(),
      preset: z.string().optional()
        .describe("Named preset ID (from forum.list_presets). Expands to predefined agent configs."),
      agents: z
        .array(
          z.object({
            role: z.string().min(1),
            persona: z.string().optional()
              .describe("Agent persona/instructions. Filled from role library if omitted."),
            model: z.string().optional()
              .describe("Model ID (provider/model). Uses role default if omitted."),
          }),
        )
        .optional()
        .describe("Explicit agent configs. Takes priority over preset. Missing fields filled from role library."),
      agent_count: z.number().int().min(2).max(8).optional()
        .describe("Limit agents from preset to first N (ignored when explicit agents provided)"),
      pause_after_rounds: z.array(z.number().int().min(1).max(3)).optional()
        .describe("Automatically pause after these round numbers"),
    },
    async ({ question, context, preset, agents, agent_count, pause_after_rounds }) => {
      const topicId = generateTopicId();

      try {
        // Resolution order: explicit agents > preset > .agora/agents.json > DEFAULT_AGENTS
        let panel: AgentConfig[];
        if (agents && agents.length > 0) {
          // Smart-fill missing persona/model from role library
          panel = await resolveAgentsWithDefaults(agoraDir, agents);
        } else if (preset) {
          panel = await resolvePreset(agoraDir, preset, { agentCount: agent_count });
        } else {
          panel = await loadAgentConfig(agoraDir);
        }

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
              opencodeUrl,
              directory,
              moderatorModel,
            });

            try {
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
              console.log(`[Agora] Consensus synthesized for ${topicId}`);

              // Notify OpenCode TUI: toast + append consensus to prompt
              const confidencePct = Math.round(consensus.confidence * 100);
              const conclusionSnippet = consensus.conclusion.slice(0, 80);
              await notifyTui(opencodeUrl, {
                toast: {
                  title: "⬡ Agora 辩论完成",
                  message: `置信度 ${confidencePct}% — ${conclusionSnippet}`,
                  variant: "success",
                  duration: 8000,
                },
                appendPrompt: [
                  `\n\n[Agora 辩论完成] topic: ${topicId}`,
                  `结论：${consensus.conclusion}`,
                  `置信度：${confidencePct}%`,
                  consensus.key_arguments.length
                    ? `主要论点：\n${consensus.key_arguments.map((a) => `- ${a}`).join("\n")}`
                    : "",
                ]
                  .filter(Boolean)
                  .join("\n"),
              });
            } catch (synthesisError) {
              // Debate itself succeeded; consensus synthesis failed.
              // Mark completed anyway (debate data is intact) but log the synthesis error.
              const msg = synthesisError instanceof Error ? synthesisError.message : String(synthesisError);
              const stack = synthesisError instanceof Error ? synthesisError.stack : undefined;
              console.error(`[Agora] Consensus synthesis failed for ${topicId}: ${msg}`);
              if (stack) console.error(stack);
              await setTopicMetadata(store, topicId, "completed", new Date().toISOString());
              await store.appendEvent(topicId, {
                type: "error",
                topic_id: topicId,
                message: `[consensus] ${msg}`,
                timestamp: new Date().toISOString(),
              }).catch(() => {});
            }

            runningDebates.delete(topicId);
          })
          .catch((error) => {
            const msg = error instanceof Error ? error.message : String(error);
            const stack = error instanceof Error ? error.stack : undefined;
            console.error(`[Agora] Debate ${topicId} failed: ${msg}`);
            if (stack) console.error(stack);
            // Persist error to events log so it's visible in watch-debate
            store.appendEvent(topicId, {
              type: "error",
              topic_id: topicId,
              message: msg,
              timestamp: new Date().toISOString(),
            }).catch(() => {});
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

      // Return a compact summary suitable for OpenCode TUI display.
      // Omits full `blackboard` and `recent_posts` arrays to keep response concise.
      return toToolResult({
        topic_id: status.topic_id,
        question: status.question,
        status: status.status,
        progress: status.progress,
        agents: status.agents.map(a => ({
          role: a.role,
          model: a.model,
          status: a.status,
          last_post_preview: a.last_post_preview,
          last_post_position: a.last_post_position,
          streaming_preview: a.streaming_preview,
        })),
        pinned_blackboard: status.pinned_blackboard,
        pending_guidance: status.pending_guidance,
        latest_event: status.latest_event,
        hint: status.hint,
      });
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

  // ─── New preset management tools ────────────────────────────────────────────

  server.tool(
    "forum.list_presets",
    "List available debate presets with agent role configurations",
    {},
    async () => {
      const presets = await listPresets(agoraDir);
      return toToolResult({ presets });
    },
  );

  server.tool(
    "forum.get_preset",
    "Get full agent configuration for a named debate preset",
    {
      preset_id: z.string().min(1).describe("Preset ID from forum.list_presets"),
      agent_count: z.number().int().min(2).max(8).optional()
        .describe("Limit number of agents (picks first N from preset)"),
    },
    async ({ preset_id, agent_count }) => {
      try {
        const agents = await resolvePreset(agoraDir, preset_id, { agentCount: agent_count });
        return toToolResult({ preset_id, agents });
      } catch (error) {
        return toToolResult(
          { preset_id, error: error instanceof Error ? error.message : String(error) },
          true,
        );
      }
    },
  );

  server.tool(
    "forum.list_models",
    "List all available model IDs from OpenCode providers",
    {},
    async () => {
      return toToolResult({ models: availableModels });
    },
  );

  server.tool(
    "forum.save_preset",
    "Save a custom debate preset for future reuse",
    {
      preset_id: z.string().min(1).regex(/^[a-z0-9-]+$/)
        .describe("URL-safe preset identifier (lowercase, hyphens only)"),
      name: z.string().min(1).describe("Human-readable name"),
      description: z.string().min(1).describe("What this preset is for"),
      agents: z.array(
        z.object({
          role: z.string().min(1),
          persona: z.string().optional(),
          model: z.string().optional(),
        }),
      ).min(2).max(8),
    },
    async ({ preset_id, name, description, agents }) => {
      await savePreset(agoraDir, preset_id, { name, description, agents });
      return toToolResult({
        status: "saved",
        preset_id,
        message: `Preset "${preset_id}" saved. Use forum.start_debate_async with preset: "${preset_id}" to use it.`,
      });
    },
  );

  return server;
}

export type { ServerOptions };
export type { ProgressEvent } from "./blackboard/types.js";
