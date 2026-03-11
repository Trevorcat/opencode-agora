/**
 * AgentProcessManager unit tests
 *
 * Uses vi.mock to stub OpenCodeHttpClient — no live OpenCode server required.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentProcessManager } from "../../src/agents/process-manager.js";
import { OpenCodeHttpClient } from "../../src/agents/opencode-http-client.js";
import type { AgentConfig } from "../../src/blackboard/types.js";
import type { BuiltPrompt } from "../../src/moderator/prompt-builder.js";

// ─── Mock OpenCodeHttpClient ──────────────────────────────────────────────────
const mockCreateSession = vi.fn();
const mockDeleteSession = vi.fn();
const mockSendMessage = vi.fn();

vi.mock("../../src/agents/opencode-http-client.js", () => {
  class MockOpenCodeHttpClient {
    createSession = mockCreateSession;
    deleteSession = mockDeleteSession;
    sendMessage = mockSendMessage;
  }
  return { OpenCodeHttpClient: MockOpenCodeHttpClient };
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const agent: AgentConfig = {
  role: "economist",
  persona: "Evidence-first analyst",
  model: "openai/gpt-4o",
};

const round1Prompt: BuiltPrompt = {
  system: "You are an economist.",
  userText: "Should the city implement congestion pricing?",
};

const validPostPayload = {
  position: "Yes, implement congestion pricing.",
  reasoning: ["Reduces traffic", "Generates revenue"],
  confidence: 0.8,
  open_questions: ["What to do with revenue?"],
};

const validVotePayload = {
  chosen_position: "Yes, implement congestion pricing.",
  rationale: "Strong economic evidence.",
  confidence: 0.9,
  dissent_notes: "Some equity concerns remain.",
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("AgentProcessManager (OpenCode HTTP backend)", () => {
  it("createSession returns a session ID", async () => {
    mockCreateSession.mockResolvedValue("ses_abc123");
    const manager = new AgentProcessManager("http://localhost:7777", "/project");
    const sessionId = await manager.createSession();
    expect(sessionId).toBe("ses_abc123");
    expect(mockCreateSession).toHaveBeenCalledOnce();
  });

  it("callAgent returns a well-formed Post", async () => {
    mockSendMessage.mockResolvedValue(validPostPayload);
    const manager = new AgentProcessManager("http://localhost:7777", "/project");

    const post = await manager.callAgent("ses_abc123", agent, round1Prompt, 1);

    expect(post).toMatchObject({
      role: "economist",
      model: "openai/gpt-4o",
      round: 1,
      position: "Yes, implement congestion pricing.",
      reasoning: ["Reduces traffic", "Generates revenue"],
      confidence: 0.8,
      open_questions: ["What to do with revenue?"],
    });
    expect(typeof post.timestamp).toBe("string");
    expect(mockSendMessage).toHaveBeenCalledOnce();
    // Verify providerID/modelID split correctly
    const [, opts] = mockSendMessage.mock.calls[0];
    expect(opts.model).toEqual({ providerID: "openai", modelID: "gpt-4o" });
  });

  it("callVote returns a well-formed Vote", async () => {
    mockSendMessage.mockResolvedValue(validVotePayload);
    const manager = new AgentProcessManager("http://localhost:7777", "/project");

    const votePrompt: BuiltPrompt = { system: "Vote now.", userText: "Cast your vote." };
    const vote = await manager.callVote("ses_abc123", agent, votePrompt);

    expect(vote).toMatchObject({
      role: "economist",
      model: "openai/gpt-4o",
      chosen_position: "Yes, implement congestion pricing.",
      rationale: "Strong economic evidence.",
      confidence: 0.9,
      dissent_notes: "Some equity concerns remain.",
    });
    expect(typeof vote.timestamp).toBe("string");
  });

  it("deleteSession is best-effort (no throw on 404)", async () => {
    mockDeleteSession.mockResolvedValue(undefined);
    const manager = new AgentProcessManager("http://localhost:7777", "/project");
    await expect(manager.deleteSession("ses_abc123")).resolves.toBeUndefined();
    expect(mockDeleteSession).toHaveBeenCalledWith("ses_abc123");
  });
});
