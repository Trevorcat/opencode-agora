import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LiveStatusPoller } from '../../src/utils/poller.js';
import type { BlackboardStore } from '../../src/blackboard/store.js';
import type { LiveStatus } from '../../src/blackboard/types.js';

function makeLiveStatus(overrides: Partial<LiveStatus> = {}): LiveStatus {
  return {
    topic_id: 'topic-1',
    status: 'running',
    current_round: 1,
    total_rounds: 3,
    agents: [],
    blackboard: [],
    pending_guidance: 0,
    recent_posts: [],
    ...overrides,
  };
}

describe('LiveStatusPoller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls onUpdate with current LiveStatus on each tick', async () => {
    const status = makeLiveStatus();
    const store = {
      getLiveStatus: vi.fn().mockResolvedValue(status),
    } as unknown as BlackboardStore;

    const onUpdate = vi.fn();
    const poller = new LiveStatusPoller(store, 'topic-1', 500, onUpdate);

    poller.start();

    // Advance past one interval
    await vi.advanceTimersByTimeAsync(500);

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith(status);

    // Advance past another interval
    await vi.advanceTimersByTimeAsync(500);

    expect(onUpdate).toHaveBeenCalledTimes(2);

    poller.stop();
  });

  it('stop() prevents further calls', async () => {
    const status = makeLiveStatus();
    const store = {
      getLiveStatus: vi.fn().mockResolvedValue(status),
    } as unknown as BlackboardStore;

    const onUpdate = vi.fn();
    const poller = new LiveStatusPoller(store, 'topic-1', 500, onUpdate);

    poller.start();
    await vi.advanceTimersByTimeAsync(500);
    expect(onUpdate).toHaveBeenCalledTimes(1);

    poller.stop();

    await vi.advanceTimersByTimeAsync(1000);
    // No additional calls after stop
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('handles store returning null gracefully', async () => {
    const store = {
      getLiveStatus: vi.fn().mockResolvedValue(null),
    } as unknown as BlackboardStore;

    const onUpdate = vi.fn();
    const poller = new LiveStatusPoller(store, 'topic-1', 500, onUpdate);

    poller.start();

    // Should not throw, onUpdate should not be called with null
    await expect(vi.advanceTimersByTimeAsync(500)).resolves.not.toThrow();

    expect(onUpdate).not.toHaveBeenCalled();

    poller.stop();
  });

  it('respects intervalMs between polls', async () => {
    const status = makeLiveStatus();
    const store = {
      getLiveStatus: vi.fn().mockResolvedValue(status),
    } as unknown as BlackboardStore;

    const onUpdate = vi.fn();
    // Use 1000ms interval
    const poller = new LiveStatusPoller(store, 'topic-1', 1000, onUpdate);

    poller.start();

    // Not called before first interval
    await vi.advanceTimersByTimeAsync(999);
    expect(onUpdate).toHaveBeenCalledTimes(0);

    // Called after first interval
    await vi.advanceTimersByTimeAsync(1);
    expect(onUpdate).toHaveBeenCalledTimes(1);

    // Called after second interval
    await vi.advanceTimersByTimeAsync(1000);
    expect(onUpdate).toHaveBeenCalledTimes(2);

    poller.stop();
  });

  it('start() returns a stop function that also stops polling', async () => {
    const status = makeLiveStatus();
    const store = {
      getLiveStatus: vi.fn().mockResolvedValue(status),
    } as unknown as BlackboardStore;

    const onUpdate = vi.fn();
    const poller = new LiveStatusPoller(store, 'topic-1', 500, onUpdate);

    const stop = poller.start();

    await vi.advanceTimersByTimeAsync(500);
    expect(onUpdate).toHaveBeenCalledTimes(1);

    // Use returned stop function
    stop();

    await vi.advanceTimersByTimeAsync(1000);
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });
});
