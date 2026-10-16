import { afterEach, expect, it, vi } from 'vitest';
import { createSkillTools, readSkill, skillCatalog } from './skills.ts';

const root = 'cook-with-gordon';
const load = async (tool: ReturnType<typeof createSkillTools>[number], resource: string) =>
  JSON.parse(
    (await tool.execute({ resource }, { toolCallId: crypto.randomUUID() } as never)) as string,
  );
afterEach(() => vi.unstubAllGlobals());

it('advertises one core skill and resolves every supporting resource directly from it', async () => {
  expect(skillCatalog()).toHaveLength(1);
  expect(Object.keys(skillCatalog()[0]!)).toEqual(['name', 'description']);
  const entry = await readSkill(root);
  expect(entry.ok).toBe(true);
  if (!entry.ok) throw new Error(entry.error);
  expect(entry.references).toHaveLength(11);
  for (const reference of entry.references) {
    const child = await readSkill(reference.resource);
    expect(child.ok, reference.resource).toBe(true);
    if (!child.ok) throw new Error(child.error);
    for (const next of child.references) expect((await readSkill(next.resource)).ok).toBe(true);
  }
});

it('does not read arbitrary files or call external services while loading guidance', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  for (const resource of ['../.env.local', '/etc/passwd', 'https://example.com/skill', 'unknown'])
    expect((await readSkill(resource)).ok).toBe(false);
  const tool = createSkillTools()[0]!;
  await load(tool, root);
  await load(tool, 'references/update-progress.md');
  expect(fetch).not.toHaveBeenCalled();
});

it('supplies full relevant procedures as saved work moves from ingredients to recipe to execution', async () => {
  const { agentInstructions } = await import('./agent.ts');
  const content = async (resource: string) => {
    const value = await readSkill(resource);
    if (!value.ok) throw new Error(value.error);
    return value.content;
  };
  const initial = agentInstructions({ revision: 0 });
  expect(initial).toContain(await content('references/agree-ingredients.md'));
  expect(initial).not.toContain(await content('references/update-progress.md'));
  const accepted = agentInstructions({
    revision: 1,
    document: { id: 'draft', title: 'Rice', servings: 2, steps: [] },
    ingredientChecks: { draft: { accepted: true } },
  });
  expect(accepted).toContain(await content('references/build-recipe.md'));
  const cooking = agentInstructions({ revision: 2, meal: { stage: 'cook' } });
  expect(cooking).toContain(await content('references/guide-meal.md'));
  expect(cooking).toContain(await content('references/update-progress.md'));
});
