import type { State } from './kitchen.ts';

// Coalesce snapshots while Gemini is updating. Never inject a spoken turn.
export function createCoachingSync(update: (state: State) => Promise<void>, initialRevision = -1) {
  let applied = initialRevision;
  let latest: State | undefined;
  let pending: Promise<void> | undefined;
  const sync = (state: State): Promise<void> => {
    if (state.revision > applied && (!latest || state.revision >= latest.revision)) latest = state;
    if (!pending && latest) {
      pending = (async () => {
        while (latest && latest.revision > applied) {
          const snapshot: State = latest;
          await update(snapshot);
          applied = Math.max(applied, snapshot.revision);
          if (latest === snapshot) latest = undefined;
        }
      })().finally(() => {
        pending = undefined;
      });
    }
    return pending ?? Promise.resolve();
  };
  return Object.assign(sync, {
    observe(state: State) {
      applied = Math.max(applied, state.revision);
      if (latest && latest.revision <= applied) latest = undefined;
    },
  });
}
