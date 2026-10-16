import { afterEach, expect, it, vi } from 'vitest';
import { createAlarms } from './alarms.ts';

afterEach(() => vi.useRealTimers());

it('announces each real deadline once, retries interrupted delivery, and ignores cancelled timers', async () => {
  vi.useFakeTimers();
  const now = Date.now();
  const state = {
    revision: 1,
    timers: [
      { id: 'eggs', label: 'eggs', deadline: now + 30000, status: 'running' },
      { id: 'toast', label: 'toast', deadline: now + 45000, status: 'running' },
      { id: 'cancelled', label: 'tea', deadline: now + 1000, status: 'cancelled' },
    ],
  };
  const speak = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
  const alarms = createAlarms(async () => state, speak);
  alarms.sync(state);
  await vi.advanceTimersByTimeAsync(29999);
  expect(speak).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(speak.mock.calls).toEqual([['eggs']]);
  await vi.advanceTimersByTimeAsync(2000);
  expect(speak.mock.calls).toEqual([['eggs'], ['eggs']]);
  alarms.sync(state);
  await vi.advanceTimersByTimeAsync(13000);
  expect(speak.mock.calls).toEqual([['eggs'], ['eggs'], ['toast']]);
  alarms.sync(state);
  await vi.advanceTimersByTimeAsync(60000);
  expect(speak).toHaveBeenCalledTimes(3);
  expect(state.timers.every((t) => t.status !== 'acknowledged')).toBe(true);
  alarms.close();
});
