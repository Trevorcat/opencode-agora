import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  Consensus,
  DebateStatus,
  Post,
  Topic,
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
}
