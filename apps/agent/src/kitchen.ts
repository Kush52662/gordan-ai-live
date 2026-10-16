import { llm } from '@livekit/agents';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

type Schema = {
  name: string;
  parameters: { properties: Record<string, unknown>; required?: string[] };
};
const schemas = JSON.parse(
  readFileSync(new URL('./tool-schemas.json', import.meta.url), 'utf8'),
) as Schema[];
const parameters = (name: string) => {
  const input = schemas.find((schema) => schema.name === name)!.parameters;
  return {
    ...input,
    type: 'object',
    additionalProperties: false,
  } as llm.FunctionTool['parameters'];
};
export type State = { revision: number; commands?: string[]; [key: string]: unknown };
export function createKitchenClient(
  token?: string,
  onState?: (state: State, source: 'poll' | 'tool') => void,
) {
  const endpoint = new URL('/api/kitchen', process.env.GORDON_API_URL ?? 'http://localhost:3000');
  if (endpoint.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(endpoint.hostname))
    throw new Error('Kitchen requires HTTPS outside localhost.');
  endpoint.searchParams.set('view', 'agent');
  let latest: State | undefined,
    pending: Promise<unknown> = Promise.resolve(),
    closed = false,
    watching = false,
    connected = false;
  const abort = new AbortController();
  const results = new Map<string, unknown>();
  const commands = new Map<
    string,
    { revision: number; commandId: string; action: Record<string, unknown> }
  >();
  const sessionId = crypto.randomUUID();
  const accept = (state: State, source: 'poll' | 'tool') => {
    delete state.commands;
    if (!latest || state.revision > latest.revision) {
      latest = state;
      onState?.(state, source);
    }
  };
  async function request(body?: unknown) {
    if (!token) throw new Error('Saved kitchen access is unavailable. Reconnect to save changes.');
    const response = await fetch(endpoint, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(12000),
    });
    const state = (await response.json()) as State & { error?: string };
    if (!response.ok) {
      if (response.status === 409) await request();
      throw new Error(state.error ?? 'Your document could not be saved.');
    }
    accept(state, body ? 'tool' : 'poll');
    return state;
  }
  async function read() {
    if (watching && !connected) throw new Error('Kitchen updates are reconnecting.');
    const state = latest ?? (await request());
    return { ...state, now: Date.now() };
  }
  async function connect() {
    if (!token) throw new Error('Saved kitchen access is unavailable.');
    if (watching) return read();
    watching = true;
    let resolve!: (state: State) => void;
    const initial = new Promise<State>((done) => {
      resolve = done;
    });
    void (async () => {
      while (!closed) {
        try {
          const url = new URL('/api/kitchen/stream', endpoint);
          url.searchParams.set('view', 'agent');
          const response = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
            signal: abort.signal,
          });
          if (!response.ok || !response.body) throw new Error('Kitchen change stream unavailable.');
          connected = true;
          const reader = response.body.getReader(),
            decoder = new TextDecoder();
          let buffer = '';
          try {
            while (!closed) {
              const { value, done } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              let index;
              while ((index = buffer.indexOf('\n\n')) >= 0) {
                const frame = buffer.slice(0, index);
                buffer = buffer.slice(index + 2);
                const data = frame
                  .split('\n')
                  .filter((line) => line.startsWith('data: '))
                  .map((line) => line.slice(6))
                  .join('\n');
                if (data) {
                  const state = JSON.parse(data) as State;
                  accept(state, 'poll');
                  resolve(state);
                }
              }
            }
          } finally {
            reader.releaseLock();
          }
        } catch {
          if (!closed) console.warn('Kitchen change stream reconnecting.');
        } finally {
          connected = false;
        }
        if (!closed) await new Promise((done) => setTimeout(done, 1000));
      }
    })();
    let timeout: ReturnType<typeof setTimeout>;
    try {
      return await Promise.race([
        initial,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('Kitchen change stream timed out.')), 12000);
        }),
      ]);
    } finally {
      clearTimeout(timeout!);
    }
  }
  function run(key: string, action: Record<string, unknown> | null) {
    const task = pending.then(async () => {
      if (results.has(key)) return results.get(key);
      try {
        if (!action) return { ok: true, result: await read() };
        let command = commands.get(key);
        if (!command) {
          const state = latest ?? (await request());
          const hex = createHash('sha256').update(`${sessionId}:${key}`).digest('hex');
          command = {
            revision: state.revision,
            commandId: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`,
            action,
          };
          commands.set(key, command);
        }
        const result = {
          ok: true,
          result: await request(command),
          now: Date.now(),
          silent:
            action.type === 'update_recipe_document' &&
            !action.patch &&
            !action.checks &&
            !action.acceptIngredients &&
            !action.suggestions &&
            !action.recipeId,
        };
        results.set(key, result);
        return result;
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Not saved.',
          state: latest,
        };
      }
    });
    pending = task.catch(() => {});
    return task;
  }
  return {
    read,
    connect,
    peek: () => latest,
    close: () => {
      closed = true;
      abort.abort();
    },
    tools: [
      llm.tool({
        name: 'edit_recipe',
        description:
          'Edit the single live recipe document and autosave it. Send only changed fields in patch; omitted fields stay unchanged. Start a different dish with createNew=true. First draft: title, servings, quantified ingredients, steps=[]; no guessed packet measurements. Ingredients stay editable in the same document. checks records only quantities the cook confirms; acceptIngredients=true only for agreement to the current list. Once agreed, add steps to this same document, without resending unchanged ingredients. Edits to ingredients invalidate acceptance and clear stale draft methods. Use stable step IDs; heat is cook, cold dishes omit cook. Method or notes edits preserve ingredient agreement. A technique question alone is not an edit. recipeId selects another saved document or active-meal; omit to edit the current document. preferences saves supplied facts/allergies in the same call; suggestions optionally shows 2–4 dish ideas without creating a recipe. One call applies the entire edit atomically. Ingredient agreement only creates a ready method: editing never starts execution or authorizes spoken prep commands. On a request to begin, use update_cooking before coaching.',
        parameters: parameters('update_recipe_document'),
        execute: (args, { toolCallId }) =>
          run(toolCallId, { type: 'update_recipe_document', ...args }),
      }),
      llm.tool({
        name: 'update_cooking',
        description:
          'Create, cancel or acknowledge real timers, and record cooking progress. A request to set timers requires this tool with timers:[{operation:"start",label:"eggs",seconds:30}]; confirm only returned timers. Update real cooking execution in one atomic call. event begin_preparation starts the agreed complete current recipe (or recipeId) before prep coaching. If the cook reports prep already completed, record that work and cooking_started before any heating instructions, not begin_preparation alone. completedStepIds records actual reported work. stageComplete=true only if the cook reports all remaining actions in the current stage done; combine it with cooking_started, plating_started or meal_finished when requested. cooking_started automatically starts elapsed time once; never create a countdown for elapsed time. Cold recipes go from prep directly to plating. timers can batch named countdown starts, cancellations or acknowledgments; start needs seconds and label, cancel/acknowledge needs timerId or label. Timers mean check food, not doneness. To check remaining time, call with no changes: returns current cached state with fresh now and real deadlines without an API request. Preserve reported progress; do not treat a method overview as permission to begin or silence as completion.',
        parameters: parameters('update_cooking_session'),
        execute: (args, { toolCallId }) =>
          run(
            toolCallId,
            Object.keys(args).length ? { type: 'update_cooking_session', ...args } : null,
          ),
      }),
    ],
  };
}
