export class TimeoutError extends Error {
  name = 'TimeoutError';

  constructor(message: string) {
    super(message);
  }
}

export interface TimeoutOptions {
  timeoutMs: number;
  label?: string;
}

export async function withTimeout<T>(
  fn: () => Promise<T>,
  opts: TimeoutOptions
): Promise<T> {
  const { timeoutMs, label } = opts;

  return new Promise((resolve, reject) => {
    let settled = false;

    const timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true;
        const message = label
          ? `Operation "${label}" timed out after ${timeoutMs}ms`
          : `Operation timed out after ${timeoutMs}ms`;
        reject(new TimeoutError(message));
      }
    }, timeoutMs);

    fn()
      .then((result) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeoutId);
          resolve(result);
        }
      })
      .catch((error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeoutId);
          reject(error);
        }
      });
  });
}
