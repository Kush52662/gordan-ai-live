import { describe, expect, it } from 'vitest';
import {
  type Action,
  type Kitchen,
  type RecipeInput,
  emptyKitchen,
  ingredientCheck,
  recipeFingerprint,
  transition,
} from './model';

const recipe: RecipeInput = {
  title: 'Tomato pasta',
  servings: 2,
  ingredients: [
    { name: 'pasta', amount: 200, unit: 'g' },
    { name: 'tomatoes', amount: 300, unit: 'g' },
  ],
  steps: [
    { id: 'prep', stage: 'prep', instruction: 'Prepare tomatoes.' },
    { id: 'cook', stage: 'cook', instruction: 'Cook pasta and sauce.' },
    { id: 'plate', stage: 'plate', instruction: 'Serve.' },
  ],
};
const apply = (state: Kitchen, action: Action) =>
  transition(state, { commandId: crypto.randomUUID(), revision: state.revision, action });
const save = () => apply(emptyKitchen(), { type: 'save_recipe', recipe });
const check = (state: Kitchen, id: string, availability: 'yes' | 'no', accept = false) =>
  apply(state, {
    type: 'check_ingredients',
    recipeId: id,
    fingerprint: recipeFingerprint(recipe),
    checks: recipe.ingredients.map((_, index) => ({ index, availability })),
    accept,
  });

describe('ingredient acceptance gate', () => {
  it('allows saving but blocks preparation until the full list is explicitly accepted', () => {
    let state = save();
    const id = state.recipes[0].id;
    expect(() => apply(state, { type: 'start_meal', recipeId: id })).toThrow(/accept/);
    state = check(state, id, 'yes');
    expect(() => apply(state, { type: 'start_meal', recipeId: id })).toThrow(/accept/);
    state = check(state, id, 'yes', true);
    state = apply(state, { type: 'start_meal', recipeId: id });
    expect(state.meal?.stage).toBe('prep');
  });
  it('rejects acceptance with missing ingredients and rejects stale recipe checks', () => {
    const state = save();
    const id = state.recipes[0].id;
    expect(() => check(state, id, 'no', true)).toThrow(/missing/);
    expect(() =>
      apply(state, {
        type: 'check_ingredients',
        recipeId: id,
        fingerprint: 'old-recipe',
        checks: [],
        accept: true,
      })
    ).toThrow(/changed/);
    expect(ingredientCheck(state, id, recipe).accepted).toBe(false);
  });

  it('requires method reconciliation after ingredient edits even after availability is reaccepted', () => {
    let state = save();
    const id = state.recipes[0].id;
    const revised = {
      ...recipe,
      ingredients: [{ ...recipe.ingredients[0], name: 'rice' }, recipe.ingredients[1]],
    };
    state = apply(state, { type: 'save_recipe', recipeId: id, recipe: revised });
    state = apply(state, {
      type: 'check_ingredients',
      recipeId: id,
      fingerprint: recipeFingerprint(revised),
      checks: revised.ingredients.map((_, index) => ({ index, availability: 'yes' })),
      accept: true,
    });
    expect(() => apply(state, { type: 'start_meal', recipeId: id })).toThrow(/Reconcile/);
    state = apply(state, {
      type: 'save_recipe',
      recipeId: id,
      recipe: {
        ...revised,
        steps: revised.steps.map((step) =>
          step.id === 'cook' ? { ...step, instruction: 'Cook the rice with tomatoes.' } : step
        ),
      },
      reconciled: true,
    });
    expect(state.recipes[0].needsReconciliation).toBe(false);
    expect(apply(state, { type: 'start_meal', recipeId: id }).meal).not.toBeNull();
  });
});
