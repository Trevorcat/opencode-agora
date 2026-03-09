import { describe, it, expect } from 'vitest';
import { barrierAllSettled, type BarrierResult } from '../../src/sync/barrier';

describe('barrierAllSettled', () => {
  it('returns all fulfilled when all tasks succeed', async () => {
    const tasks = [
      () => Promise.resolve(1),
      () => Promise.resolve(2),
      () => Promise.resolve(3),
    ];

    const results = await barrierAllSettled(tasks);

    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({ status: 'fulfilled', value: 1 });
    expect(results[1]).toEqual({ status: 'fulfilled', value: 2 });
    expect(results[2]).toEqual({ status: 'fulfilled', value: 3 });
  });

  it('returns mix of fulfilled and rejected when one task fails', async () => {
    const tasks = [
      () => Promise.resolve(1),
      () => Promise.reject(new Error('fail')),
      () => Promise.resolve(3),
    ];

    const results = await barrierAllSettled(tasks);

    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({ status: 'fulfilled', value: 1 });
    expect(results[1]).toEqual({
      status: 'rejected',
      reason: new Error('fail'),
    });
    expect(results[2]).toEqual({ status: 'fulfilled', value: 3 });
  });

  it('runs tasks in parallel', async () => {
    const order: number[] = [];
    const tasks = [
      () => new Promise<void>((resolve) => {
        order.push(1);
        setTimeout(() => order.push(4), 10);
        setTimeout(resolve, 20);
      }),
      () => new Promise<void>((resolve) => {
        order.push(2);
        setTimeout(() => order.push(5), 10);
        setTimeout(resolve, 20);
      }),
      () => new Promise<void>((resolve) => {
        order.push(3);
        setTimeout(() => order.push(6), 10);
        setTimeout(resolve, 20);
      }),
    ];

    const start = Date.now();
    const results = await barrierAllSettled(tasks);
    const duration = Date.now() - start;

    expect(results).toHaveLength(3);
    expect(order).toEqual([1, 2, 3, 4, 5, 6]);
    expect(duration).toBeLessThan(50);
  });

  it('returns empty result for empty task list', async () => {
    const results = await barrierAllSettled([]);

    expect(results).toEqual([]);
  });

  it('attaches roles correctly when provided', async () => {
    const tasks = [
      () => Promise.resolve(1),
      () => Promise.reject(new Error('fail')),
    ];
    const roles = ['first', 'second'];

    const results = await barrierAllSettled(tasks, roles);

    expect(results[0]).toEqual({
      status: 'fulfilled',
      value: 1,
      role: 'first',
    });
    expect(results[1]).toEqual({
      status: 'rejected',
      reason: new Error('fail'),
      role: 'second',
    });
  });

  it('handles roles with fewer roles than tasks', async () => {
    const tasks = [
      () => Promise.resolve(1),
      () => Promise.resolve(2),
      () => Promise.resolve(3),
    ];
    const roles = ['first'];

    const results = await barrierAllSettled(tasks, roles);

    expect(results[0]).toEqual({ status: 'fulfilled', value: 1, role: 'first' });
    expect(results[1]).toEqual({ status: 'fulfilled', value: 2 });
    expect(results[2]).toEqual({ status: 'fulfilled', value: 3 });
  });

  it('handles roles with more roles than tasks', async () => {
    const tasks = [
      () => Promise.resolve(1),
    ];
    const roles = ['first', 'second'];

    const results = await barrierAllSettled(tasks, roles);

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ status: 'fulfilled', value: 1, role: 'first' });
  });
});
