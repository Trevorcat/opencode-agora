export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  skip?: boolean;
  onSkip?: (error: Error) => void;
  sleepFn?: (ms: number) => Promise<void>;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions
): Promise<T | null> {
  const { maxAttempts, baseDelayMs, skip = false, onSkip, sleepFn } = opts;

  if (maxAttempts < 1) {
    throw new Error('maxAttempts must be at least 1');
  }

  const sleep = sleepFn ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        await sleep(delay);
      }
    }
  }

  if (skip && onSkip && lastError) {
    onSkip(lastError);
  }

  if (skip) {
    return null;
  }

  throw lastError ?? new Error('withRetry failed without a captured error');
}
