import { llm } from '@livekit/agents';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { posix } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import type { State } from './kitchen.ts';

const root = 'cook-with-gordon';
const directory = new URL('../skills/cook-with-gordon/', import.meta.url);
const paths = [
  'SKILL.md',
  'references/choose-dish.md',
  'references/agree-ingredients.md',
  'references/build-recipe.md',
  'references/build-guidance.md',
  'references/guide-meal.md',
  'references/update-progress.md',
  'references/adapt-recipe.md',
  'references/save-restore.md',
  'references/contracts.md',
  'references/guidance-plan.schema.json',
  'references/scenarios.md',
] as const;
const allowed = new Set<string>(paths);
const entry = readFileSync(new URL('SKILL.md', directory), 'utf8');
const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(entry);
if (!match) throw new Error('Invalid core skill frontmatter.');
const metadata = z
  .object({
    name: z.literal(root),
    description: z.string().min(1).max(1024),
    compatibility: z.string().max(500).optional(),
  })
  .parse(parse(match[1]!));
const body = match[2]!.trim();

function references(path: string, content: string) {
  return [...content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)]
    .map(([, href]) => href!.split('#')[0]!)
    .filter((href) => href && !/^[a-z]+:/i.test(href))
    .map((href) => {
      const resolved = posix.normalize(posix.join(posix.dirname(path), href));
      if (!allowed.has(resolved)) throw new Error(`Broken skill reference: ${path} -> ${href}`);
      return { link: href, resource: resolved === 'SKILL.md' ? root : resolved };
    });
}
references('SKILL.md', body);

export function skillCatalog() {
  return [{ name: metadata.name, description: metadata.description }];
}

export async function readSkill(resource: string) {
  const path = resource === root ? 'SKILL.md' : resource;
  if (!allowed.has(path)) return { ok: false as const, error: 'Unknown bundled skill resource.' };
  const content = path === 'SKILL.md' ? body : await readFile(new URL(path, directory), 'utf8');
  return {
    ok: true as const,
    skill: root,
    resource,
    relativeTo: posix.dirname(path),
    ...(metadata.compatibility ? { compatibility: metadata.compatibility } : {}),
    content,
    references: references(path, content),
  };
}

const procedureCache = new Map<string, string>();
export function coreSkillInstructions(context?: State) {
  const meal = context?.meal as { stage: string } | null | undefined;
  const document = context?.document as { id: string; steps?: unknown[] } | null | undefined;
  const checks = (context?.ingredientChecks ?? {}) as Record<string, { accepted: boolean }>;
  const selected =
    meal && meal.stage !== 'finished' && (!document || document.id === 'active-meal')
      ? ['guide-meal', 'update-progress']
      : document?.steps?.length
        ? ['guide-meal', 'update-progress', 'save-restore', 'adapt-recipe']
        : document && checks[document.id]?.accepted
          ? ['build-recipe', 'save-restore']
          : document
            ? ['agree-ingredients', 'adapt-recipe']
            : ['choose-dish', 'agree-ingredients'];
  const guidance = selected
    .map((name) => {
      const path = `references/${name}.md`;
      let content = procedureCache.get(path);
      if (!content) {
        content = readFileSync(new URL(path, directory), 'utf8').trim();
        references(path, content);
        procedureCache.set(path, content);
      }
      return `Resource: ${path}\n${content}`;
    })
    .join('\n\n');
  return `${body}\n\n## Current supporting procedures\nThese resources are already loaded for the saved state; current user intent decides whether to apply them. Other references remain available through load_skill.\n\n${guidance}`;
}

export function createSkillTools(active = false) {
  // Activation belongs to this agent session, never a process-wide singleton.
  return [
    llm.tool({
      name: 'load_skill',
      description:
        'Read cook-with-gordon, then its referenced sub-procedures or contracts by returned resource ID. Local guidance only; does not start cooking, update progress, schedule speech or reconnect. Re-read after compaction when needed.',
      parameters: z.object({
        resource: z.enum([root, ...paths.filter((path) => path !== 'SKILL.md')]),
      }),
      execute: async ({ resource }) => {
        if (resource !== root && !active)
          return JSON.stringify({
            ok: false,
            error: 'Load cook-with-gordon first to access its sub-procedures.',
          });
        const result = await readSkill(resource);
        if (result.ok && resource === root) active = true;
        return JSON.stringify(result);
      },
    }),
  ];
}
