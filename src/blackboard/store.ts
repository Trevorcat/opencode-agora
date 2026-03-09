import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  BlackboardItem,
  Consensus,
  DebateStatus,
  Guidance,
  LiveStatus,
  Post,
  Topic,
  TopicWithBlackboard,
  Vote,
} from "./types.js";

export class BlackboardStore {
  constructor(private readonly rootDir: string) {}

  async init(): Promise<void> {
    await mkdir(this.topicsDir(), { recursive: true });
  }

  async saveTopic(topic: Topic): Promise<void> {
    const topicDir = this.topicDir(topic.id);
    await mkdir(topicDir, { recursive: true });
    await this.writeJson(path.join(topicDir, "meta.json"), topic);
  }

  async getTopic(topicId: string): Promise<Topic | null> {
    return this.readJson<Topic>(path.join(this.topicDir(topicId), "meta.json"));
  }

  async updateTopicStatus(topicId: string, status: DebateStatus): Promise<void> {
    const topic = await this.getTopic(topicId);
    if (!topic) {
      return;
    }

    await this.saveTopic({
      ...topic,
      status,
    });
  }

  async savePost(topicId: string, round: number, post: Post): Promise<void> {
    const roundDir = this.roundDir(topicId, round);
    await mkdir(roundDir, { recursive: true });
    await this.writeJson(path.join(roundDir, `${post.role}.json`), post);
  }

  async getPost(topicId: string, round: number, role: string): Promise<Post | null> {
    return this.readJson<Post>(path.join(this.roundDir(topicId, round), `${role}.json`));
  }

  async getRoundPosts(topicId: string, round: number): Promise<Post[]> {
    const roundDir = this.roundDir(topicId, round);

    try {
      const entries = await readdir(roundDir, { withFileTypes: true });
      const posts: Post[] = [];

      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) {
          continue;
        }

        const post = await this.readJson<Post>(path.join(roundDir, entry.name));
        if (post) {
          posts.push(post);
        }
      }

      return posts;
    } catch (error) {
      if (this.isMissingFileError(error)) {
        return [];
      }

      throw error;
    }
  }

  async saveVote(topicId: string, vote: Vote): Promise<void> {
    const voteDir = this.voteDir(topicId);
    await mkdir(voteDir, { recursive: true });
    await this.writeJson(path.join(voteDir, `${vote.role}.json`), vote);
  }

  async getVotes(topicId: string): Promise<Vote[]> {
    const voteDir = this.voteDir(topicId);

    try {
      const entries = await readdir(voteDir, { withFileTypes: true });
      const votes: Vote[] = [];

      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) {
          continue;
        }

        const vote = await this.readJson<Vote>(path.join(voteDir, entry.name));
        if (vote) {
          votes.push(vote);
        }
      }

      return votes;
    } catch (error) {
      if (this.isMissingFileError(error)) {
        return [];
      }

      throw error;
    }
  }

  async saveConsensus(topicId: string, consensus: Consensus): Promise<void> {
    const topicDir = this.topicDir(topicId);
    await mkdir(topicDir, { recursive: true });
    await this.writeJson(path.join(topicDir, "consensus.json"), consensus);
  }

  async getConsensus(topicId: string): Promise<Consensus | null> {
    return this.readJson<Consensus>(path.join(this.topicDir(topicId), "consensus.json"));
  }

  async listTopics(): Promise<string[]> {
    const topicsDir = this.topicsDir();

    try {
      const entries = await readdir(topicsDir, { withFileTypes: true });
      return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    } catch (error) {
      if (this.isMissingFileError(error)) {
        return [];
      }

      throw error;
    }
  }

  private topicsDir(): string {
    return path.join(this.rootDir, "topics");
  }

  private topicDir(topicId: string): string {
    return path.join(this.topicsDir(), topicId);
  }

  private roundDir(topicId: string, round: number): string {
    return path.join(this.topicDir(topicId), `round-${round}`);
  }

  private voteDir(topicId: string): string {
    return path.join(this.topicDir(topicId), "vote");
  }

  private async readJson<T>(filePath: string): Promise<T | null> {
    try {
      const raw = await readFile(filePath, "utf8");
      return JSON.parse(raw) as T;
    } catch (error) {
      if (this.isMissingFileError(error)) {
        return null;
      }

      throw error;
    }
  }

  private async writeJson(filePath: string, data: unknown): Promise<void> {
    await writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
  }

  private isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
  }

  // ─── Blackboard Operations ───────────────────────────────────────────────

  async saveBlackboardItem(topicId: string, item: BlackboardItem): Promise<void> {
    const blackboardDir = this.blackboardDir(topicId);
    await mkdir(blackboardDir, { recursive: true });
    await this.writeJson(path.join(blackboardDir, `${item.id}.json`), item);
  }

  async getBlackboard(topicId: string): Promise<BlackboardItem[]> {
    const blackboardDir = this.blackboardDir(topicId);
    try {
      const entries = await readdir(blackboardDir, { withFileTypes: true });
      const items: BlackboardItem[] = [];
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
        const item = await this.readJson<BlackboardItem>(path.join(blackboardDir, entry.name));
        if (item) items.push(item);
      }
      return items.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    } catch (error) {
      if (this.isMissingFileError(error)) return [];
      throw error;
    }
  }

  async updateBlackboardItem(topicId: string, itemId: string, updates: Partial<BlackboardItem>): Promise<void> {
    const item = await this.readJson<BlackboardItem>(path.join(this.blackboardDir(topicId), `${itemId}.json`));
    if (!item) throw new Error(`Blackboard item ${itemId} not found`);
    await this.saveBlackboardItem(topicId, { ...item, ...updates });
  }

  // ─── Guidance Queue Operations ────────────────────────────────────────────

  async addGuidance(topicId: string, guidance: Guidance): Promise<void> {
    const guidanceDir = this.guidanceDir(topicId);
    await mkdir(guidanceDir, { recursive: true });
    await this.writeJson(path.join(guidanceDir, `${guidance.id}.json`), guidance);
  }

  async getPendingGuidance(topicId: string, round?: number, targetAgents?: string[]): Promise<Guidance[]> {
    const guidanceDir = this.guidanceDir(topicId);
    try {
      const entries = await readdir(guidanceDir, { withFileTypes: true });
      const guidanceList: Guidance[] = [];
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
        const guidance = await this.readJson<Guidance>(path.join(guidanceDir, entry.name));
        if (!guidance || guidance.consumed) continue;
        // Filter by round if specified
        if (round !== undefined && guidance.target_round !== undefined && guidance.target_round !== round) continue;
        // Filter by target agents if specified
        if (targetAgents !== undefined && guidance.target_agents !== undefined) {
          const hasOverlap = guidance.target_agents.some(agent => targetAgents.includes(agent));
          if (!hasOverlap) continue;
        }
        guidanceList.push(guidance);
      }
      return guidanceList.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    } catch (error) {
      if (this.isMissingFileError(error)) return [];
      throw error;
    }
  }

  async markGuidanceConsumed(topicId: string, guidanceId: string): Promise<void> {
    const guidance = await this.readJson<Guidance>(path.join(this.guidanceDir(topicId), `${guidanceId}.json`));
    if (!guidance) throw new Error(`Guidance ${guidanceId} not found`);
    await this.addGuidance(topicId, { ...guidance, consumed: true });
  }

  // ─── Live Status ─────────────────────────────────────────────────────────

  async getLiveStatus(topicId: string): Promise<LiveStatus | null> {
    const topic = await this.getTopic(topicId);
    if (!topic) return null;

    const currentRound = await this.getCurrentRound(topicId);
    const posts = await this.getRoundPosts(topicId, currentRound);
    const allPosts: Post[] = [];
    for (let i = 1; i <= currentRound; i++) {
      allPosts.push(...await this.getRoundPosts(topicId, i));
    }
    const pendingGuidance = await this.getPendingGuidance(topicId);

    return {
      topic_id: topicId,
      status: topic.status === "running" && await this.isPaused(topicId) ? "paused" : topic.status,
      current_round: currentRound,
      total_rounds: topic.config.max_rounds,
      agents: topic.config.agents.map(agent => ({
        role: agent.role,
        model: agent.model,
        status: this.determineAgentStatus(agent.role, posts),
        last_post: [...allPosts].reverse().find((p: Post) => p.role === agent.role),
      })),
      blackboard: await this.getBlackboard(topicId),
      pending_guidance: pendingGuidance.length,
      recent_posts: allPosts.slice(-10), // Last 10 posts
    };
  }

  // ─── Pause/Resume State ──────────────────────────────────────────────────

  async setPauseState(topicId: string, paused: boolean, reason?: string): Promise<void> {
    const topicDir = this.topicDir(topicId);
    await mkdir(topicDir, { recursive: true });
    const statePath = path.join(topicDir, "pause-state.json");
    await this.writeJson(statePath, { paused, reason, timestamp: new Date().toISOString() });
  }

  async isPaused(topicId: string): Promise<boolean> {
    const statePath = path.join(this.topicDir(topicId), "pause-state.json");
    const state = await this.readJson<{ paused: boolean }>(statePath);
    return state?.paused ?? false;
  }

  async getPauseReason(topicId: string): Promise<string | undefined> {
    const statePath = path.join(this.topicDir(topicId), "pause-state.json");
    const state = await this.readJson<{ reason?: string }>(statePath);
    return state?.reason;
  }

  // ─── Session Attachment ───────────────────────────────────────────────────

  async attachSession(topicId: string, sessionId: string): Promise<void> {
    const topicDir = this.topicDir(topicId);
    await mkdir(topicDir, { recursive: true });
    const sessionsPath = path.join(topicDir, "attached-sessions.json");
    const sessions = await this.readJson<string[]>(sessionsPath) ?? [];
    if (!sessions.includes(sessionId)) {
      sessions.push(sessionId);
      await this.writeJson(sessionsPath, sessions);
    }
  }

  async detachSession(topicId: string, sessionId: string): Promise<void> {
    const topicDir = this.topicDir(topicId);
    await mkdir(topicDir, { recursive: true });
    const sessionsPath = path.join(topicDir, "attached-sessions.json");
    const sessions = await this.readJson<string[]>(sessionsPath) ?? [];
    const filtered = sessions.filter(id => id !== sessionId);
    await this.writeJson(sessionsPath, filtered);
  }

  async getAttachedSessions(topicId: string): Promise<string[]> {
    const sessionsPath = path.join(this.topicDir(topicId), "attached-sessions.json");
    return await this.readJson<string[]>(sessionsPath) ?? [];
  }

  // ─── Helper Methods ───────────────────────────────────────────────────────

  private async getCurrentRound(topicId: string): Promise<number> {
    const topicDir = this.topicDir(topicId);
    try {
      const entries = await readdir(topicDir, { withFileTypes: true });
      let maxRound = 0;
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith("round-")) {
          const roundNum = parseInt(entry.name.replace("round-", ""), 10);
          if (!isNaN(roundNum) && roundNum > maxRound) {
            // Check if this round has any posts
            const roundPosts = await this.getRoundPosts(topicId, roundNum);
            if (roundPosts.length > 0) {
              maxRound = roundNum;
            }
          }
        }
      }
      return maxRound || 1;
    } catch {
      return 1;
    }
  }

  private determineAgentStatus(role: string, posts: Post[]): "waiting" | "thinking" | "posted" | "error" {
    const post = posts.find(p => p.role === role);
    if (post) return "posted";
    // In a real implementation, we'd track "thinking" state separately
    return "waiting";
  }

  private blackboardDir(topicId: string): string {
    return path.join(this.topicDir(topicId), "blackboard");
  }

  private guidanceDir(topicId: string): string {
    return path.join(this.topicDir(topicId), "guidance");
  }
}
