import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withRetry, type RetryOptions } from '../../src/resilience/retry';

describe('withRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('succeeds on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const opts: RetryOptions = {
      maxAttempts: 3,
      baseDelayMs: 100,
    };

    const result = await withRetry(fn, opts);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on transient failure and succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');

    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const opts: RetryOptions = {
      maxAttempts: 3,
      baseDelayMs: 100,
      sleepFn,
    };

    const result = await withRetry(fn, opts);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleepFn).toHaveBeenCalledTimes(2);
  });

  it('throws last error after exhausting maxAttempts when skip=false', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('persistent failure'));
    const opts: RetryOptions = {
      maxAttempts: 3,
      baseDelayMs: 100,
      skip: false,
    };

    await expect(withRetry(fn, opts)).rejects.toThrow('persistent failure');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('applies exponential backoff delays correctly', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const opts: RetryOptions = {
      maxAttempts: 4,
      baseDelayMs: 100,
      skip: true,
      sleepFn,
    };

    await withRetry(fn, opts);

    expect(sleepFn).toHaveBeenCalledTimes(3);
    expect(sleepFn).toHaveBeenNthCalledWith(1, 100);   // 100 * 2^0
    expect(sleepFn).toHaveBeenNthCalledWith(2, 200);   // 100 * 2^1
    expect(sleepFn).toHaveBeenNthCalledWith(3, 400);   // 100 * 2^2
  });

  it('returns null and calls onSkip when skip=true', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('persistent failure'));
    const onSkip = vi.fn();
    const opts: RetryOptions = {
      maxAttempts: 2,
      baseDelayMs: 50,
      skip: true,
      onSkip,
    };

    const result = await withRetry(fn, opts);

    expect(result).toBeNull();
    expect(onSkip).toHaveBeenCalledWith(expect.any(Error));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('throws a configuration error when maxAttempts is less than 1', async () => {
    const fn = vi.fn().mockResolvedValue('unused');
    const opts: RetryOptions = {
      maxAttempts: 0,
      baseDelayMs: 50,
    };

    await expect(withRetry(fn, opts)).rejects.toMatchObject({
      message: 'maxAttempts must be at least 1',
    });
    expect(fn).not.toHaveBeenCalled();
  });
});
