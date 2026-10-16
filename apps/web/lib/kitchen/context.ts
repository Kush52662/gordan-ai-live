import {
  type Kitchen,
  emptyBrief,
  executionProgress,
  ingredientCheck,
  recipeForCheck,
} from './model.ts';

// Return one bounded cooking context, never every recipe's full instructions.
export function agentContext(state: Kitchen) {
  const meal = state.meal;
  const progress = meal ? executionProgress(meal) : undefined;
  const step = progress?.currentStep;
  const document =
    state.meal &&
    (state.documentId === 'active-meal' || (!state.documentId && state.meal.stage !== 'finished'))
      ? { ...state.meal.recipe, id: 'active-meal', version: state.meal.recipeVersion }
      : (state.recipes.find((recipe) => recipe.id === state.documentId) ??
        [...state.recipes].sort((a, b) => b.updatedAt - a.updatedAt)[0] ??
        null);
  return {
    revision: state.revision,
    now: Date.now(),
    documentId: state.documentId ?? null,
    document,
    discovery: state.discovery ?? null,
    brief: { ...emptyBrief(), ...state.brief },
    ingredientChecks: Object.fromEntries(
      [
        ...state.recipes.slice(0, 20).map((recipe) => [recipe.id, recipe] as const),
        ...(state.plans ?? []).map((plan, index) => [`plan:${index}`, plan] as const),
        ...(state.choices ?? []).map((recipe, index) => [`choice:${index}`, recipe] as const),
        ...(document ? [[document.id, document] as const] : []),
        ...(meal ? [['active-meal', meal.recipe] as const] : []),
      ].map(([id, recipe]) => {
        const check = ingredientCheck(state, id, recipe);
        return [
          id,
          {
            accepted: check.accepted,
            ...(id === document?.id ||
            id.startsWith('plan:') ||
            id.startsWith('choice:') ||
            id === 'active-meal'
              ? {
                  rows: recipe.ingredients.map((row, index) => ({
                    index,
                    ...row,
                    availability: check.available[index],
                  })),
                }
              : {}),
          },
        ];
      })
    ),
    timers: (state.timers ?? []).filter((timer) => timer.status === 'running'),
    recipeCount: state.recipes.length,
    recipes: [...state.recipes]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 20)
      .map(({ id, title, servings, version, needsReconciliation }) => ({
        id,
        title,
        servings,
        version,
        needsReconciliation: !!needsReconciliation,
      })),
    plans: (state.plans ?? []).map((plan, index) => ({ ...plan, id: `plan:${index}` })),
    choices: (state.choices ?? []).map(({ title, servings, ingredients }, index) => ({
      id: `choice:${index}`,
      title,
      servings,
      ingredients,
    })),
    meal: meal
      ? {
          needsReconciliation: !!meal.needsReconciliation,
          id: meal.id,
          recipeId: meal.recipeId,
          recipeVersion: meal.recipeVersion,
          stage: meal.stage,
          execution: {
            executor: 'cook',
            totalSteps: progress!.totalSteps,
            completedSteps: progress!.completedSteps,
            currentStepNumber: progress!.currentStepNumber,
            nextStepNumber: progress!.nextStepNumber,
            awaiting: meal.needsReconciliation
              ? 'plan_update'
              : meal.stage === 'finished'
                ? 'nothing'
                : step
                  ? 'cook_report'
                  : 'stage_start_or_finish',
          },
          completed: meal.completed,
          recipe: {
            title: meal.recipe.title,
            servings: meal.recipe.servings,
            notes: meal.recipe.notes,
            ingredients: meal.recipe.ingredients,
          },
          currentStep: step ?? null,
          nextSteps: meal.recipe.steps
            .filter((s) => !meal.completed.includes(s.id) && s.id !== step?.id)
            .slice(0, 3),
          startedAt: meal.startedAt,
          finishedAt: meal.finishedAt,
          timers: meal.timers.filter((timer) => timer.status === 'running'),
        }
      : null,
  };
}
export function requestedRecipe(state: Kitchen, id: string) {
  return recipeForCheck(state, id) ?? null;
}
