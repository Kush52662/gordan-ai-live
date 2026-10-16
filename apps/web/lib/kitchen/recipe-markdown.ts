import { type IngredientPlan, type RecipeInput, recipeInput } from './model';

// JSON is canonical. Markdown and the rich-text page are views of the same fields.
const stages = { prep: 'Prep', cook: 'Cook', plate: 'Plate' } as const;
const escape = (text: string) => text.replace(/([\\*_[\]`])/g, '\\$1');
export function recipeMarkdown(
  recipe: IngredientPlan & Partial<Pick<RecipeInput, 'steps' | 'notes'>>
) {
  const parts = [
    `# ${escape(recipe.title)}`,
    `Servings: ${recipe.servings}`,
    '## Ingredients',
    recipe.ingredients.map((i) => `- ${escape(i.name)}: ${i.amount} ${escape(i.unit)}`).join('\n'),
  ];
  for (const [stage, heading] of Object.entries(stages)) {
    const steps = recipe.steps?.filter((s) => s.stage === stage);
    if (steps?.length)
      parts.push(
        `## ${heading}`,
        steps.map((s, index) => `${index + 1}. ${s.instruction.replace(/\n/g, '\n   ')}`).join('\n')
      );
  }
  if (recipe.notes) parts.push('## Notes', recipe.notes);
  return parts.join('\n\n');
}
export type DocumentNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: DocumentNode[];
};
const text = (node: DocumentNode): string =>
  node.text ?? (node.content ?? []).map(text).join(node.type === 'listItem' ? ' ' : '');
export function recipeFromDocument(
  doc: DocumentNode,
  serialize: (node: DocumentNode) => string,
  previous?: RecipeInput,
  normalize = (value: string) => value.trim()
): RecipeInput {
  let title = '',
    servings = 0,
    section = '';
  const ingredients: RecipeInput['ingredients'] = [];
  const pending: { stage: 'prep' | 'cook' | 'plate'; instruction: string }[] = [];
  const notes: DocumentNode[] = [];
  const aliases: Record<string, string> = {
    ingredients: 'ingredients',
    prep: 'prep',
    preparation: 'prep',
    cook: 'cook',
    cooking: 'cook',
    plate: 'plate',
    plating: 'plate',
    notes: 'notes',
  };
  for (const node of doc.content ?? []) {
    const value = text(node).trim();
    if (node.type === 'heading' && node.attrs?.level === 1 && !title) {
      title = value;
      continue;
    }
    if (node.type === 'paragraph' && /^servings\s*:/i.test(value)) {
      servings = Number(value.split(':').slice(1).join(':').trim());
      continue;
    }
    if (node.type === 'heading' && node.attrs?.level === 2) {
      section = aliases[value.toLowerCase()] ?? 'notes';
      if (section === 'notes' && value.toLowerCase() !== 'notes') notes.push(node);
      continue;
    }
    if (!value && !node.content?.length) continue;
    if (section === 'notes' || !section) {
      notes.push(node);
      continue;
    }
    const items = ['bulletList', 'orderedList'].includes(node.type ?? '')
      ? (node.content ?? [])
      : [node];
    for (const item of items) {
      if (section === 'ingredients') {
        const line = text(item).trim();
        const match = line.match(/^(.+):\s*(\d+(?:[.,]\d+)?(?:\/\d+)?)\s+(.+)$/);
        if (!match) throw new Error(`Write each ingredient as “carrots: 400 g”. Check: ${line}`);
        const [numerator, denominator = '1'] = match[2].replace(',', '.').split('/');
        ingredients.push({
          name: match[1].trim(),
          amount: Number(numerator) / Number(denominator),
          unit: match[3].trim(),
        });
      } else {
        const content = item.type === 'listItem' ? item.content : [item];
        const instruction = serialize({ type: 'doc', content }).trim();
        if (instruction) pending.push({ stage: section as 'prep' | 'cook' | 'plate', instruction });
      }
    }
  }
  const used = new Set<string>();
  const matches = pending.map((step) => {
    const found = previous?.steps.find(
      (old) =>
        !used.has(old.id) &&
        old.stage === step.stage &&
        normalize(old.instruction) === normalize(step.instruction)
    );
    if (found) used.add(found.id);
    return found;
  });
  const steps = pending.map((step, index) => {
    if (matches[index]) return matches[index]!; // Preserve exact protected text, including its Markdown.
    const old = previous?.steps.filter((s) => s.stage === step.stage)[
      pending.slice(0, index).filter((s) => s.stage === step.stage).length
    ];
    const id = old && !used.has(old.id) ? old.id : crypto.randomUUID();
    used.add(id);
    return { ...step, id };
  });
  const noteText = serialize({ type: 'doc', content: notes }).trim();
  return recipeInput.parse({
    title,
    servings,
    ingredients,
    steps,
    ...(noteText ? { notes: noteText } : {}),
  });
}
