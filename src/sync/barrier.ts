export interface BarrierResult<T> {
  status: 'fulfilled' | 'rejected';
  value?: T;
  reason?: Error;
  role?: string;
}

export async function barrierAllSettled<T>(
  tasks: Array<() => Promise<T>>,
  roles?: string[]
): Promise<BarrierResult<T>[]> {
  const promises = tasks.map((task) => task());
  const settledResults = await Promise.allSettled(promises);

  return settledResults.map((result, index): BarrierResult<T> => {
    const barrierResult: BarrierResult<T> = {
      status: result.status,
      role: roles?.[index],
    };

    if (result.status === 'fulfilled') {
      barrierResult.value = result.value;
    } else {
      barrierResult.reason = result.reason as Error;
    }

    return barrierResult;
  });
}
