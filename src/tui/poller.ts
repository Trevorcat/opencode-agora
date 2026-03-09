import type { BlackboardStore } from '../blackboard/store.js';
import type { LiveStatus } from '../blackboard/types.js';

export class LiveStatusPoller {
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    private store: BlackboardStore,
    private topicId: string,
    private intervalMs: number,
    private onUpdate: (status: LiveStatus) => void
  ) {}

  start(): () => void {
    this.intervalId = setInterval(async () => {
      const status = await this.store.getLiveStatus(this.topicId);
      if (status !== null) {
        this.onUpdate(status);
      }
    }, this.intervalMs);

    return () => this.stop();
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
