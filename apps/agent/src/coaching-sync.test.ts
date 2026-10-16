import { expect, it, vi } from 'vitest';
import { createCoachingSync } from './coaching-sync.ts';

it('coalesces manual progress changes without reverting to stale steps', async () => {
  let release!: () => void;
  const update = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    )
    .mockResolvedValue(undefined);
  const sync = createCoachingSync(update, 1);
  const pending = sync({ revision: 2, meal: { currentStep: 'chop' } });
  void sync({ revision: 4, meal: { currentStep: 'plate' } });
  void sync({ revision: 3, meal: { currentStep: 'cook' } });
  release();
  await pending;
  await sync({ revision: 4 });
  sync.observe({ revision: 5 });
  await sync({ revision: 5 });
  expect(update.mock.calls.map(([state]) => state.revision)).toEqual([2, 4]);
});
