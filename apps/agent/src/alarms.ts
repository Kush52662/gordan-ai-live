import type { State } from './kitchen.ts';

type Timer = { id: string; label: string; deadline: number; status: string };
export function runningTimers(state: State): Timer[] {
  const meal = state.meal as { timers?: Timer[] } | null;
  return [...((state.timers ?? []) as Timer[]), ...(meal?.timers ?? [])].filter(
    (timer) => timer.status === 'running',
  );
}
// Polling also picks up timers created from the screen. Retry failed/interrupted
// announcements without confusing "audio generated" with "the cook heard it".
export function createAlarms(
  read: () => Promise<State>,
  speak: (label: string) => Promise<boolean>,
) {
  const alarms = new Map<string, ReturnType<typeof setTimeout>>();
  const announced = new Set<string>();
  const delivering = new Set<string>();
  let closed = false;
  function sync(state: State) {
    if (closed) return;
    const timers = runningTimers(state);
    for (const [id, alarm] of alarms) {
      if (!timers.some((timer) => timer.id === id)) {
        clearTimeout(alarm);
        alarms.delete(id);
      }
    }
    for (const timer of timers) {
      if (announced.has(timer.id) || delivering.has(timer.id) || alarms.has(timer.id)) continue;
      alarms.set(
        timer.id,
        setTimeout(
          () => {
            void deliver(timer);
          },
          Math.max(0, timer.deadline - Date.now()),
        ),
      );
    }
  }
  async function deliver(timer: Timer) {
    alarms.delete(timer.id);
    if (closed) return;
    delivering.add(timer.id);
    let retry = false;
    try {
      const fresh = await read();
      if (
        !closed &&
        runningTimers(fresh).some((t) => t.id === timer.id && t.deadline <= Date.now())
      ) {
        if (await speak(timer.label)) announced.add(timer.id);
        else retry = true;
      }
    } catch {
      retry = true;
    } finally {
      delivering.delete(timer.id);
      if (retry && !closed)
        alarms.set(
          timer.id,
          setTimeout(() => {
            void deliver(timer);
          }, 2000),
        );
    }
  }
  return {
    sync,
    close() {
      closed = true;
      for (const alarm of alarms.values()) clearTimeout(alarm);
      alarms.clear();
    },
  };
}
