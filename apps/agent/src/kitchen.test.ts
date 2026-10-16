import { afterEach, expect, it, vi } from 'vitest';
import { agentContext } from '../../web/lib/kitchen/context.ts';
import { emptyKitchen, transition } from '../../web/lib/kitchen/model.ts';
import { createKitchenClient } from './kitchen.ts';

function fixture() {
  let state = emptyKitchen();
  const requests: { method: string; action?: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: URL, options: RequestInit) => {
      expect(options.headers).toMatchObject({ Authorization: 'Bearer fixture' });
      requests.push({
        method: options.method!,
        ...(options.body ? { action: JSON.parse(options.body as string).action.type } : {}),
      });
      try {
        if (options.method === 'POST')
          state = transition(state, JSON.parse(options.body as string));
        return Response.json(agentContext(state));
      } catch (e) {
        return Response.json({ error: (e as Error).message }, { status: 422 });
      }
    }),
  );
  const client = createKitchenClient('fixture');
  const call = (name: string, args: unknown, id = crypto.randomUUID()) =>
    client.tools.find((t) => t.name === name)!.execute(args, { toolCallId: id } as never);
  return { client, call, requests, state: () => state };
}
afterEach(() => vi.unstubAllGlobals());
const ingredients = [{ name: 'rice', amount: 100, unit: 'g' }];
const steps = [
  { id: 'measure', stage: 'prep', instruction: 'Measure rice and water.' },
  { id: 'cook', stage: 'cook', instruction: 'Cook rice until tender.' },
  { id: 'plate', stage: 'plate', instruction: 'Serve in bowls.' },
];
it('uses one document from ingredient draft to method and edit, with one POST per edit and cached reads', async () => {
  const f = fixture();
  await f.client.read();
  expect(f.requests).toHaveLength(1);
  await f.call('edit_recipe', {
    createNew: true,
    patch: { title: 'Rice', servings: 2, ingredients, steps: [] },
    preferences: { dietaryExclusions: ['peanuts'] },
  });
  const id = f.state().documentId!;
  expect(f.state().recipes[0].steps).toEqual([]);
  expect(f.requests).toHaveLength(2);
  await f.call('edit_recipe', {
    checks: [{ index: 0, availability: 'yes' }],
    acceptIngredients: true,
    patch: { steps },
  });
  expect(f.requests).toHaveLength(3);
  expect(f.state().recipes[0].id).toBe(id);
  await f.call('edit_recipe', { patch: { notes: 'Serve warm.' } });
  expect(f.state().recipes).toHaveLength(1);
  expect(f.state().recipes[0].notes).toBe('Serve warm.');
  expect(f.state().brief!.dietaryExclusions).toEqual(['peanuts']);
  await f.call('update_cooking', {});
  await f.client.read();
  expect(f.requests).toHaveLength(4);
});
it('atomically records reported progress and stages, starts the clock once, batches timers, and retries idempotently', async () => {
  const f = fixture();
  await f.call('edit_recipe', {
    createNew: true,
    patch: { title: 'Rice', servings: 2, ingredients, steps: [] },
  });
  await f.call('edit_recipe', {
    checks: [{ index: 0, availability: 'yes' }],
    acceptIngredients: true,
    patch: { steps },
  });
  await f.call('update_cooking', { event: 'begin_preparation' });
  expect(f.state().meal!.startedAt).toBeNull();
  const id = crypto.randomUUID();
  const args = {
    completedStepIds: ['measure'],
    event: 'cooking_started',
    timers: [
      { operation: 'start', label: 'rice', seconds: 30 },
      { operation: 'start', label: 'tea', seconds: 60 },
    ],
  };
  await f.call('update_cooking', args, id);
  const start = f.state().meal!.startedAt;
  const count = f.requests.length;
  await f.call('update_cooking', args, id);
  expect(f.requests).toHaveLength(count);
  expect(f.state().meal!.timers).toHaveLength(2);
  expect(new Set(f.state().meal!.timers.map((t) => t.id)).size).toBe(2);
  await f.call('update_cooking', { event: 'plating_started', completedStepIds: ['cook'] });
  expect(f.state().meal!.startedAt).toBe(start);
  expect(
    await f.call('update_cooking', { event: 'meal_finished', completedStepIds: ['plate'] }),
  ).toMatchObject({ ok: false });
  expect(f.state().meal!.completed).not.toContain('plate'); // failed combined update rolls back entirely
  await f.call('update_cooking', {
    event: 'meal_finished',
    completedStepIds: ['plate'],
    cancelTimersConfirmed: true,
  });
  expect(f.state().meal!.stage).toBe('finished');
  expect(f.state().meal!.startedAt).toBe(start);
});
it('preserves untouched row availability, clears a stale method, and never starts a draft', async () => {
  const f = fixture();
  await f.call('edit_recipe', {
    createNew: true,
    patch: { title: 'Rice', servings: 2, ingredients, steps: [] },
  });
  expect(await f.call('update_cooking', { event: 'begin_preparation' })).toMatchObject({
    ok: false,
  });
  expect(
    await f.call('edit_recipe', {
      checks: [{ index: 0, availability: 'yes' }],
      acceptIngredients: true,
      patch: {
        steps: [
          { ...steps[0], instruction: 'Gather ingredients and bring a pot of water to a boil.' },
          ...steps.slice(1),
        ],
      },
    }),
  ).toMatchObject({ ok: false, error: expect.stringContaining('Heating belongs to cook') });
  expect(f.state().recipes[0].steps).toEqual([]);
  await f.call('edit_recipe', {
    checks: [{ index: 0, availability: 'yes' }],
    acceptIngredients: true,
    patch: { steps },
  });
  await f.call('edit_recipe', {
    patch: { ingredients: [...ingredients, { name: 'salt', amount: 1, unit: 'pinch' }] },
  });
  const context = agentContext(f.state());
  expect(context.ingredientChecks[f.state().documentId!]!.rows!.map((r) => r.availability)).toEqual(
    ['yes', 'unknown'],
  );
  expect(f.state().recipes[0].steps).toEqual([]);
  expect(f.state().meal).toBeNull();
});
it('creates a different document only when requested and leaves earlier saved work intact', async () => {
  const f = fixture();
  for (const title of ['Rice', 'Salad'])
    await f.call('edit_recipe', {
      createNew: true,
      patch: { title, servings: 2, ingredients, steps: [] },
    });
  expect(f.state().recipes).toHaveLength(2);
  expect(new Set(f.state().recipes.map((r) => r.id)).size).toBe(2);
});
