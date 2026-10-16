import { expect, it } from 'vitest';
import { MarkdownManager } from '@tiptap/markdown';
import { StarterKit } from '@tiptap/starter-kit';
import { type Action, emptyKitchen, recipeInput, transition } from './model';
import { recipeFromDocument, recipeMarkdown } from './recipe-markdown';

const manager = new MarkdownManager({
  extensions: [StarterKit.configure({ link: false, underline: false })],
});
const recipe = {
  title: 'Roasted carrots',
  servings: 2,
  ingredients: [{ name: 'carrots', amount: 400, unit: 'g' }],
  steps: [
    { id: 'wash', stage: 'prep' as const, instruction: 'Wash the carrots.' },
    { id: 'roast', stage: 'cook' as const, instruction: 'Roast until **tender**.' },
    { id: 'serve', stage: 'plate' as const, instruction: 'Serve warm.' },
  ],
  notes: 'Finish with *lemon* if you like.',
};
const parse = (markdown: string) =>
  recipeFromDocument(
    manager.parse(markdown),
    (node) => manager.serialize(node),
    recipe,
    (value) => manager.serialize(manager.parse(value)).trim()
  );
it('round-trips the whole Markdown page into JSON, preserving rich text, notes and stable action IDs', () => {
  expect(parse(recipeMarkdown(recipe))).toEqual(recipe);
  const edited = parse(
    recipeMarkdown(recipe).replace('400 g', '500 g').replace('*lemon*', '*lime*')
  );
  expect(edited.ingredients[0].amount).toBe(500);
  expect(edited.notes).toBe('Finish with *lime* if you like.');
  expect(edited.steps.map((s) => s.id)).toEqual(['wash', 'roast', 'serve']);
});
it('keeps choices optional, accepts the same click/voice selection, and rejects stale document writes', () => {
  let kitchen = emptyKitchen();
  const act = (action: Action) => {
    kitchen = transition(kitchen, {
      commandId: crypto.randomUUID(),
      revision: kitchen.revision,
      action,
    });
  };
  act({
    type: 'offer_dishes',
    question: 'What sounds good?',
    options: [
      { id: 'roast', title: recipe.title, description: 'Warm and hands-off.' },
      { id: 'salad', title: 'Carrot salad', description: 'Fresh and crunchy.' },
    ],
  });
  const discoveryId = kitchen.discovery!.id;
  act({ type: 'select_dish', discoveryId, optionId: 'roast' });
  expect(kitchen.discovery!.selectedId).toBe('roast');
  expect(kitchen.plans).toEqual([]);
  act({ type: 'save_recipe', recipe });
  const id = kitchen.recipes[0].id;
  const base = JSON.stringify(recipeInput.parse(recipe));
  act({
    type: 'edit_document',
    recipeId: id,
    base,
    recipe: { ...recipe, notes: 'User-written notes.' },
  });
  expect(kitchen.recipes[0].notes).toBe('User-written notes.');
  expect(() => act({ type: 'edit_document', recipeId: id, base, recipe })).toThrow(
    /draft is retained/
  );
  act({
    type: 'offer_dishes',
    question: 'Other ideas?',
    options: [{ id: 'soup', title: 'Soup', description: 'Warming.' }],
  });
  expect(() => act({ type: 'select_dish', discoveryId, optionId: 'salad' })).toThrow(
    /options have changed/
  );
  // Discovery is conversational, not a new mandatory API gate.
  act({ type: 'propose_ingredients', plans: [recipe] });
  expect(kitchen.plans?.[0].title).toBe(recipe.title);
});
