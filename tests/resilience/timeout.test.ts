import { describe, it, expect } from 'vitest';
import { withTimeout, TimeoutError, type TimeoutOptions } from '../../src/resilience/timeout';

describe('withTimeout', () => {
  it('resolves when fn completes before timeout', async () => {
    const fn = async () => 'success';
    const opts: TimeoutOptions = { timeoutMs: 1000 };

    const result = await withTimeout(fn, opts);

    expect(result).toBe('success');
  });

  it('rejects with TimeoutError when fn exceeds timeout', async () => {
    const fn = async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return 'late';
    };
    const opts: TimeoutOptions = { timeoutMs: 10 };

    await expect(withTimeout(fn, opts)).rejects.toThrow(TimeoutError);
  });

  it('rejects with TimeoutError containing correct message', async () => {
    const fn = async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return 'late';
    };
    const opts: TimeoutOptions = { timeoutMs: 10, label: 'my-operation' };

    await expect(withTimeout(fn, opts)).rejects.toThrow('Operation "my-operation" timed out after 10ms');
  });

  it('rejects with TimeoutError with default label when not provided', async () => {
    const fn = async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return 'late';
    };
    const opts: TimeoutOptions = { timeoutMs: 10 };

    await expect(withTimeout(fn, opts)).rejects.toThrow('Operation timed out after 10ms');
  });
});
