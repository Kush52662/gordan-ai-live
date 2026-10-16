import { z } from 'zod';

export const stageSchema = z.enum(['prep', 'cook', 'plate', 'finished']);
const stepSchema = z.object({
  id: z.string().min(1).max(100),
  stage: z
    .enum(['prep', 'cook', 'plate'])
    .describe(
      'prep: gather, measure, wash or chop without heat. cook: every heating action, including bringing water to a boil or heating a pan. plate: serve and arrange. Cold recipes omit cook.'
    ),
  instruction: z.string().trim().min(1).max(2000),
});
const ingredientSchema = z.object({
  name: z.string().trim().min(1).max(150),
  amount: z.number().positive().max(100000),
  unit: z.string().trim().min(1).max(80),
});
export const ingredientPlanInput = z.object({
  title: z.string().trim().min(1).max(150),
  servings: z.number().int().min(1).max(100),
  ingredients: z.array(ingredientSchema).min(1).max(100),
});
export type IngredientPlan = z.infer<typeof ingredientPlanInput>;
export const recipeInput = z
  .object({
    title: z.string().trim().min(1).max(150),
    servings: z.number().int().min(1).max(100),
    ingredients: z.array(ingredientSchema).min(1).max(100),
    steps: z
      .array(stepSchema)
      .max(150)
      .describe(
        'The complete ordered method, not a partial list of changed steps. Empty until ingredients are agreed. Include prep and plate; all heating belongs to cook.'
      ),
    notes: z.string().max(12000).optional(),
  })
  .superRefine((r, ctx) => {
    if (new Set(r.steps.map((s) => s.id)).size !== r.steps.length)
      ctx.addIssue({ code: 'custom', message: 'Step IDs must be unique' });
    // Catch explicit heating commands that previously bypassed the cooking clock.
    // This is a narrow validation guard, not a general language classifier.
    const heatingCommand =
      /(?:^|[.!?;,]\s*|\b(?:and|then)\s+)(?:(?:gently|slowly)\s+)?(?:bring\b[^.!?;]*\b(?:boil|simmer)|(?:preheat|heat|boil|simmer|fry|sauté|saute|bake|roast|grill)\b)/i;
    r.steps.forEach((step, index) => {
      if (step.stage === 'prep' && heatingCommand.test(step.instruction))
        ctx.addIssue({
          code: 'custom',
          path: ['steps', index, 'stage'],
          message:
            'Heating belongs to cook, not prep. Split gathering/measuring into prep and move heating to a cook step so the cooking clock starts correctly.',
        });
    });
    const order = { prep: 0, cook: 1, plate: 2 };
    if (
      r.steps.length &&
      ['prep', 'plate'].some((stage) => !r.steps.some((s) => s.stage === stage))
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Include preparation and plating steps; add cooking only when needed',
      });
    if (r.steps.some((s, i) => i > 0 && order[s.stage] < order[r.steps[i - 1].stage]))
      ctx.addIssue({
        code: 'custom',
        message: 'Steps must follow preparation, cooking, plating order',
      });
  });
export type RecipeInput = z.infer<typeof recipeInput>;
export type Recipe = RecipeInput & {
  id: string;
  version: number;
  updatedAt: number;
  needsReconciliation?: boolean;
};
export const dishOptionSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().trim().min(1).max(150),
  description: z.string().trim().min(1).max(400),
});
export type DishOption = z.infer<typeof dishOptionSchema>;
export type Discovery = {
  id: string;
  question: string;
  options: DishOption[];
  selectedId: string | null;
};
export type Availability = 'unknown' | 'yes' | 'no';
export type IngredientCheck = {
  fingerprint: string;
  available: Availability[];
  accepted: boolean;
};
export type Timer = {
  id: string;
  label: string;
  deadline: number;
  stepId?: string;
  status: 'running' | 'cancelled' | 'acknowledged';
};
export type Meal = {
  needsReconciliation?: boolean;
  id: string;
  recipeId: string;
  recipeVersion: number;
  recipe: RecipeInput;
  stage: z.infer<typeof stageSchema>;
  completed: string[];
  startedAt: number | null;
  finishedAt: number | null;
  timers: Timer[];
};
const facts = z.array(z.string().trim().min(1).max(150)).max(50).nullable();
export const briefSchema = z.object({
  availableIngredients: facts,
  confirmedStaples: facts,
  unavailableIngredients: facts,
  dietaryExclusions: facts,
  equipment: facts,
  preferences: facts,
  servings: z.number().int().min(1).max(100).nullable(),
  timeMinutes: z.number().int().min(1).max(1440).nullable(),
  craving: z.string().trim().min(1).max(300).nullable(),
});
export type MealBrief = z.infer<typeof briefSchema>;
export const emptyBrief = (): MealBrief => ({
  availableIngredients: null,
  confirmedStaples: null,
  unavailableIngredients: null,
  dietaryExclusions: null,
  equipment: null,
  preferences: null,
  servings: null,
  timeMinutes: null,
  craving: null,
});
export type Kitchen = {
  revision: number;
  brief?: MealBrief;
  timers?: Timer[];
  discovery?: Discovery;
  choices?: RecipeInput[];
  plans?: IngredientPlan[];
  ingredientChecks?: Record<string, IngredientCheck>;
  documentId?: string;
  recipes: Recipe[];
  meal: Meal | null;
  commands: string[];
};
export const emptyKitchen = (): Kitchen => ({
  revision: 0,
  brief: emptyBrief(),
  timers: [],
  recipes: [],
  ingredientChecks: {},
  meal: null,
  commands: [],
});

export const actionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('update_recipe_document'),
    createNew: z.boolean().optional(),
    recipeId: z.string().optional(),
    patch: z
      .object({
        title: recipeInput.shape.title,
        servings: recipeInput.shape.servings,
        ingredients: recipeInput.shape.ingredients,
        steps: recipeInput.shape.steps,
        notes: recipeInput.shape.notes,
      })
      .partial()
      .optional(),
    checks: z
      .array(
        z.object({
          index: z.number().int().min(0).max(99),
          availability: z.enum(['unknown', 'yes', 'no']),
        })
      )
      .max(100)
      .optional(),
    acceptIngredients: z.boolean().optional(),
    preferences: briefSchema.partial().optional(),
    suggestions: z
      .object({
        question: z.string().min(1).max(400),
        options: z.array(dishOptionSchema).min(1).max(4),
      })
      .optional(),
  }),
  z.object({
    type: z.literal('update_cooking_session'),
    event: z
      .enum(['begin_preparation', 'cooking_started', 'plating_started', 'meal_finished'])
      .optional(),
    recipeId: z.string().optional(),
    completedStepIds: z.array(z.string()).max(150).optional(),
    stageComplete: z.boolean().optional(),
    timers: z
      .array(
        z.object({
          operation: z
            .enum(['start', 'cancel', 'acknowledge'])
            .describe(
              'start creates a real countdown; cancel stops one; acknowledge clears an expired alert.'
            ),
          label: z.string().min(1).max(80).optional(),
          seconds: z
            .number()
            .int()
            .min(1)
            .max(86400)
            .describe('Required for start: duration in seconds, e.g. 30 for thirty seconds.')
            .optional(),
          timerId: z.string().optional(),
        })
      )
      .max(8)
      .describe(
        'Execute requested countdown changes here. For two timers: [{operation:"start",label:"eggs",seconds:30},{operation:"start",label:"toast",seconds:45}]. Use the final corrected duration. An empty call only reads status and creates nothing.'
      )
      .optional(),
    replaceConfirmed: z.boolean().optional(),
    cancelTimersConfirmed: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('offer_dishes'),
    question: z.string().trim().min(1).max(400),
    options: z
      .array(dishOptionSchema)
      .min(1)
      .max(4)
      .refine(
        (options) => new Set(options.map((o) => o.id)).size === options.length,
        'Dish IDs must be unique'
      ),
  }),
  z.object({ type: z.literal('select_dish'), discoveryId: z.string(), optionId: z.string() }),
  z.object({
    type: z.literal('edit_document'),
    recipeId: z.string(),
    base: z.string().max(100000),
    recipe: recipeInput,
  }),
  z.object({
    type: z.literal('update_brief'),
    patch: briefSchema
      .partial()
      .refine((patch) => Object.keys(patch).length > 0, 'Include at least one fact to save'),
  }),
  z.object({
    type: z.literal('propose_ingredients'),
    plans: z.array(ingredientPlanInput).min(1).max(2),
  }),
  z.object({
    type: z.literal('propose_recipes'),
    planId: z.enum(['plan:0', 'plan:1']),
    recipes: z.array(recipeInput).length(1),
  }),
  z.object({
    type: z.literal('check_ingredients'),
    recipeId: z.string().min(1).max(150),
    fingerprint: z.string().min(1).max(100000),
    checks: z
      .array(
        z.object({
          index: z.number().int().min(0).max(99),
          availability: z.enum(['unknown', 'yes', 'no']),
        })
      )
      .max(100),
    accept: z.boolean().default(false),
  }),
  z.object({
    type: z.literal('save_recipe'),
    recipe: recipeInput,
    recipeId: z.string().optional(),
    reconciled: z.boolean().default(false),
  }),
  z.object({
    type: z.literal('start_meal'),
    recipeId: z.string(),
    replaceConfirmed: z.boolean().default(false),
  }),
  z.object({ type: z.literal('complete_step'), stepId: z.string() }),
  z.object({ type: z.literal('start_cooking') }),
  z.object({ type: z.literal('start_plating') }),
  z.object({
    type: z.literal('scale_recipe'),
    recipeId: z.string(),
    servings: z.number().int().min(1).max(100),
  }),
  z.object({
    type: z.literal('edit_meal'),
    recipe: recipeInput,
    confirmed: z.boolean(),
    reconciled: z.boolean().default(false),
  }),
  z.object({ type: z.literal('save_meal_recipe') }),
  z.object({
    type: z.literal('create_timer'),
    label: z.string().trim().min(1).max(80),
    seconds: z.number().int().min(1).max(86400),
    stepId: z.string().optional(),
  }),
  z.object({ type: z.literal('cancel_timer'), timerId: z.string() }),
  z.object({ type: z.literal('acknowledge_timer'), timerId: z.string() }),
  z.object({ type: z.literal('finish_meal'), cancelTimersConfirmed: z.boolean().default(false) }),
]);
export const commandSchema = z.object({
  commandId: z.string().uuid(),
  revision: z.number().int().nonnegative(),
  action: actionSchema,
});
export type Action = z.input<typeof actionSchema>;
export class Conflict extends Error {}
export function recipeFingerprint(recipe: IngredientPlan) {
  return JSON.stringify(ingredientPlanInput.parse(recipe));
}
export function recipeForCheck(state: Kitchen, id: string): IngredientPlan | undefined {
  if (id === 'active-meal') return state.meal?.recipe;
  if (/^plan:[01]$/.test(id)) return state.plans?.[Number(id.split(':')[1])];
  if (/^choice:[01]$/.test(id)) return state.choices?.[Number(id.split(':')[1])];
  return state.recipes.find((recipe) => recipe.id === id);
}
export function ingredientCheck(
  state: Kitchen,
  id: string,
  recipe: IngredientPlan
): IngredientCheck {
  const fingerprint = recipeFingerprint(recipe);
  const saved = state.ingredientChecks?.[id];
  return saved?.fingerprint === fingerprint
    ? saved
    : { fingerprint, available: recipe.ingredients.map(() => 'unknown'), accepted: false };
}
export function ingredientsAccepted(state: Kitchen, id: string, recipe: IngredientPlan) {
  const check = ingredientCheck(state, id, recipe);
  return (
    check.accepted &&
    check.available.length === recipe.ingredients.length &&
    check.available.every((value) => value === 'yes')
  );
}
function requireAcceptedIngredients(state: Kitchen, id: string, recipe: IngredientPlan) {
  if (!ingredientsAccepted(state, id, recipe))
    throw new Error(
      'Confirm every required ingredient and explicitly accept the current ingredient list before preparation or cooking.'
    );
}
export function currentStep(meal: Meal) {
  return meal.recipe.steps.find((s) => s.stage === meal.stage && !meal.completed.includes(s.id));
}

// Recipe actions are the progress units; prep/cook/plate are only categories.
export function executionProgress(meal: Meal) {
  const steps = meal.recipe.steps;
  const step = meal.needsReconciliation ? undefined : currentStep(meal);
  const next = steps.find((item) => !meal.completed.includes(item.id));
  return {
    totalSteps: steps.length,
    completedSteps: steps.filter((item) => meal.completed.includes(item.id)).length,
    currentStep: step,
    currentStepNumber: step ? steps.findIndex((item) => item.id === step.id) + 1 : null,
    nextStep: next,
    nextStepNumber: next ? steps.findIndex((item) => item.id === next.id) + 1 : null,
  };
}

// All inputs -> the same transition rules -> a new revision; no provider owns state.
export function transition(input: Kitchen, raw: unknown, now = Date.now()): Kitchen {
  const cmd = commandSchema.parse(raw);
  if (input.commands.includes(cmd.commandId)) return input;
  if (cmd.revision !== input.revision)
    throw new Conflict('The meal changed. Reload and try again.');
  const state = structuredClone(input);
  const a = cmd.action;
  const meal = state.meal;
  const requireMeal = () => {
    if (!meal || meal.stage === 'finished') throw new Error('Start a meal first.');
    return meal;
  };
  switch (a.type) {
    case 'update_recipe_document': {
      let next = state;
      let child = 0;
      const apply = (action: Action) => {
        const suffix = ((parseInt(cmd.commandId.slice(-8), 16) ^ ++child) >>> 0)
          .toString(16)
          .padStart(8, '0');
        next = transition(
          next,
          { revision: next.revision, commandId: cmd.commandId.slice(0, -8) + suffix, action },
          now
        );
      };
      if (a.preferences)
        apply({
          type: 'update_brief',
          patch: {
            ...a.preferences,
            ...(a.preferences.dietaryExclusions
              ? {
                  dietaryExclusions: [
                    ...new Set([
                      ...(next.brief?.dietaryExclusions ?? []),
                      ...a.preferences.dietaryExclusions,
                    ]),
                  ],
                }
              : {}),
          },
        });
      if (a.suggestions) apply({ type: 'offer_dishes', ...a.suggestions });
      const id = a.createNew
        ? undefined
        : (a.recipeId ??
          next.documentId ??
          (next.meal && next.meal.stage !== 'finished' ? 'active-meal' : undefined));
      const active = id === 'active-meal';
      const previous = active ? next.meal?.recipe : next.recipes.find((recipe) => recipe.id === id);
      if (id && !previous) throw new Error('Recipe document not found.');
      if (a.patch || a.checks?.length || a.acceptIngredients) {
        const oldCheck = previous
          ? ingredientCheck(next, active ? 'active-meal' : id!, previous)
          : undefined;
        const ingredientsChanged =
          !!previous &&
          ((a.patch?.ingredients &&
            JSON.stringify(a.patch.ingredients) !== JSON.stringify(previous.ingredients)) ||
            (a.patch?.servings !== undefined && a.patch.servings !== previous.servings));
        const recipe = recipeInput.parse({
          ...previous,
          ...a.patch,
          steps: a.patch?.steps ?? (ingredientsChanged && !active ? [] : (previous?.steps ?? [])),
        });
        const version = !active && previous && 'version' in previous ? Number(previous.version) : 0;
        if (a.patch || !previous)
          apply(
            active
              ? { type: 'edit_meal', recipe, confirmed: true }
              : { type: 'save_recipe', recipe, ...(id ? { recipeId: id } : {}) }
          );
        const savedId = active ? 'active-meal' : (id ?? next.recipes[0].id);
        if (ingredientsChanged && oldCheck && previous) {
          (next.ingredientChecks ??= {})[savedId] = {
            fingerprint: recipeFingerprint(recipe),
            accepted: false,
            available: recipe.ingredients.map((row) => {
              const index = previous.ingredients.findIndex(
                (old) => JSON.stringify(old) === JSON.stringify(row)
              );
              return index < 0 ? 'unknown' : (oldCheck.available[index] ?? 'unknown');
            }),
          };
        }
        if (a.checks?.length || a.acceptIngredients)
          apply({
            type: 'check_ingredients',
            recipeId: savedId,
            fingerprint: recipeFingerprint(recipe),
            checks: a.checks ?? [],
            accept: a.acceptIngredients ?? false,
          });
        if (a.patch?.steps?.length) {
          requireAcceptedIngredients(next, savedId, recipe);
          if (active && next.meal) next.meal.needsReconciliation = false;
          else next.recipes.find((r) => r.id === savedId)!.needsReconciliation = false;
        }
        if (!active) {
          const saved = next.recipes.find((r) => r.id === savedId)!;
          if (a.patch) saved.version = version + 1;
          next.documentId = savedId;
        }
        next.plans = [];
        next.choices = [];
      } else if (id && !active) next.documentId = id;
      return {
        ...next,
        revision: input.revision + 1,
        commands: [...input.commands.slice(-199), cmd.commandId],
      };
    }
    case 'update_cooking_session': {
      let next = state;
      let child = 0;
      const apply = (action: Action) => {
        const suffix = ((parseInt(cmd.commandId.slice(-8), 16) ^ ++child) >>> 0)
          .toString(16)
          .padStart(8, '0');
        next = transition(
          next,
          { revision: next.revision, commandId: cmd.commandId.slice(0, -8) + suffix, action },
          now
        );
      };
      if (a.event === 'begin_preparation') {
        const selectedId = a.recipeId ?? next.documentId;
        const recipeId = selectedId === 'active-meal' ? next.meal?.recipeId : selectedId;
        if (!recipeId) throw new Error('Choose a recipe document first.');
        if (next.meal?.recipeId !== recipeId || next.meal.stage === 'finished')
          apply({ type: 'start_meal', recipeId, replaceConfirmed: a.replaceConfirmed ?? false });
      }
      for (const stepId of a.completedStepIds ?? []) apply({ type: 'complete_step', stepId });
      if (a.stageComplete && next.meal)
        for (const step of next.meal.recipe.steps.filter(
          (s) => s.stage === next.meal!.stage && !next.meal!.completed.includes(s.id)
        ))
          apply({ type: 'complete_step', stepId: step.id });
      if (a.event === 'begin_preparation') next.documentId = 'active-meal';
      if (a.event === 'cooking_started') apply({ type: 'start_cooking' });
      if (a.event === 'plating_started') apply({ type: 'start_plating' });
      for (const timer of a.timers ?? []) {
        if (timer.operation === 'start') {
          if (!timer.label || !timer.seconds)
            throw new Error('A countdown needs a name and seconds.');
          apply({ type: 'create_timer', label: timer.label, seconds: timer.seconds });
        } else {
          const matches = [...(next.timers ?? []), ...(next.meal?.timers ?? [])].filter(
            (t) =>
              t.status === 'running' &&
              (timer.timerId
                ? t.id === timer.timerId
                : t.label.toLowerCase() === timer.label?.toLowerCase())
          );
          if (matches.length !== 1) throw new Error('Name the running timer to change.');
          apply({
            type: timer.operation === 'cancel' ? 'cancel_timer' : 'acknowledge_timer',
            timerId: matches[0].id,
          });
        }
      }
      if (a.event === 'meal_finished') {
        apply({ type: 'finish_meal', cancelTimersConfirmed: a.cancelTimersConfirmed ?? false });
        next.documentId = next.meal!.recipeId;
      }
      return {
        ...next,
        revision: input.revision + 1,
        commands: [...input.commands.slice(-199), cmd.commandId],
      };
    }

    case 'offer_dishes':
      state.discovery = {
        id: cmd.commandId,
        question: a.question,
        options: a.options,
        selectedId: null,
      };
      state.plans = [];
      state.choices = [];
      break;
    case 'select_dish':
      if (state.discovery?.id !== a.discoveryId)
        throw new Conflict('These options have changed. Choose from the current suggestions.');
      if (!state.discovery.options.some((o) => o.id === a.optionId))
        throw new Error('Dish option not found.');
      if (state.discovery.selectedId && state.discovery.selectedId !== a.optionId) {
        state.plans = [];
        state.choices = [];
      }
      state.discovery.selectedId = a.optionId;
      break;
    case 'edit_document': {
      const current =
        a.recipeId === 'active-meal' ? meal?.recipe : recipeForCheck(state, a.recipeId);
      if (!current || !('steps' in current)) throw new Error('Recipe document not found.');
      if (JSON.stringify(recipeInput.parse(current)) !== a.base)
        throw new Conflict(
          'Gordon updated this recipe while you were editing. Your draft is retained; review the newer document before retrying.'
        );
      const changed =
        JSON.stringify([current.servings, current.ingredients]) !==
        JSON.stringify([a.recipe.servings, a.recipe.ingredients]);
      if (!a.recipeId.startsWith('choice:')) {
        const next = transition(
          input,
          {
            ...cmd,
            action:
              a.recipeId === 'active-meal'
                ? { type: 'edit_meal', recipe: a.recipe, confirmed: true }
                : { type: 'save_recipe', recipeId: a.recipeId, recipe: a.recipe },
          },
          now
        );
        if (!changed)
          (next.ingredientChecks ??= {})[a.recipeId] = {
            ...ingredientCheck(input, a.recipeId, current),
            fingerprint: recipeFingerprint(a.recipe),
          };
        return next;
      }
      const recipe: Recipe = {
        ...a.recipe,
        id: cmd.commandId,
        version: 1,
        updatedAt: now,
        needsReconciliation: changed,
      };
      state.recipes.unshift(recipe);
      if (!changed)
        (state.ingredientChecks ??= {})[recipe.id] = {
          ...structuredClone(ingredientCheck(state, a.recipeId, current)),
          fingerprint: recipeFingerprint(a.recipe),
        };
      state.choices = [];
      break;
    }
    case 'update_brief':
      state.brief = briefSchema.parse({ ...emptyBrief(), ...state.brief, ...a.patch });
      break;
    case 'propose_ingredients':
      state.plans = a.plans;
      state.choices = [];
      state.ingredientChecks ??= {};
      for (let index = 0; index < a.plans.length; index++)
        state.ingredientChecks[`plan:${index}`] = {
          fingerprint: recipeFingerprint(a.plans[index]),
          available: a.plans[index].ingredients.map(() => 'unknown'),
          accepted: false,
        };
      break;
    case 'propose_recipes': {
      const plan = recipeForCheck(state, a.planId);
      if (!plan) throw new Error('Propose an ingredient list first.');
      requireAcceptedIngredients(state, a.planId, plan);
      if (recipeFingerprint(plan) !== recipeFingerprint(a.recipes[0]))
        throw new Error(
          'Cooking instructions must use the exact accepted ingredients and quantities. Revise and accept the ingredient plan first.'
        );
      state.choices = a.recipes;
      (state.ingredientChecks ??= {})['choice:0'] = structuredClone(
        ingredientCheck(state, a.planId, plan)
      );
      break;
    }
    case 'check_ingredients': {
      const recipe = recipeForCheck(state, a.recipeId);
      if (!recipe)
        throw new Error('Recipe not found. Open the current recipe to check its ingredients.');
      const check = ingredientCheck(state, a.recipeId, recipe);
      if (check.fingerprint !== a.fingerprint)
        throw new Conflict('The recipe changed. Review its current ingredients.');
      for (const row of a.checks) {
        if (row.index >= recipe.ingredients.length) throw new Error('Ingredient row not found.');
        check.available[row.index] = row.availability;
        if (row.availability !== 'unknown') {
          state.brief = { ...emptyBrief(), ...state.brief };
          const name = recipe.ingredients[row.index].name;
          const same = (value: string) => value.toLowerCase() === name.toLowerCase();
          const available = (state.brief.availableIngredients ?? []).filter(
            (value) => !same(value)
          );
          const unavailable = (state.brief.unavailableIngredients ?? []).filter(
            (value) => !same(value)
          );
          if (row.availability === 'yes') available.push(name);
          else unavailable.push(name);
          state.brief.availableIngredients = available;
          state.brief.unavailableIngredients = unavailable;
        }
      }
      check.accepted = false;
      if (a.accept) {
        if (!check.available.every((value) => value === 'yes'))
          throw new Error('Resolve all unknown or missing ingredients before accepting the list.');
        check.accepted = true;
      }
      (state.ingredientChecks ??= {})[a.recipeId] = check;
      break;
    }
    case 'save_recipe': {
      const existing = a.recipeId ? state.recipes.find((r) => r.id === a.recipeId) : undefined;
      if (a.recipeId && !existing) throw new Error('Recipe not found.');
      const changedIngredients =
        !!existing &&
        JSON.stringify([existing.servings, existing.ingredients]) !==
          JSON.stringify([a.recipe.servings, a.recipe.ingredients]);
      if (a.reconciled) {
        if (!existing || changedIngredients)
          throw new Error(
            'Save the changed ingredients and accept their list before reconciling instructions.'
          );
        requireAcceptedIngredients(state, existing.id, existing);
      }
      const recipe: Recipe = {
        ...a.recipe,
        id: existing?.id ?? cmd.commandId,
        version: (existing?.version ?? 0) + 1,
        updatedAt: now,
        needsReconciliation: a.reconciled
          ? false
          : changedIngredients || existing?.needsReconciliation || false,
      };
      state.recipes = [recipe, ...state.recipes.filter((r) => r.id !== recipe.id)];
      const choiceIndex =
        state.choices?.findIndex(
          (choice) => recipeFingerprint(choice) === recipeFingerprint(recipe)
        ) ?? -1;
      if (choiceIndex >= 0) {
        const review = ingredientCheck(state, `choice:${choiceIndex}`, recipe);
        (state.ingredientChecks ??= {})[recipe.id] = structuredClone(review);
      }
      state.choices = [];
      break;
    }
    case 'scale_recipe': {
      const recipe = state.recipes.find((r) => r.id === a.recipeId);
      if (!recipe) throw new Error('Recipe not found.');
      const factor = a.servings / recipe.servings;
      recipe.ingredients = recipe.ingredients.map((i) => ({
        ...i,
        amount: Math.round(i.amount * factor * 10000) / 10000,
      }));
      recipe.servings = a.servings;
      recipe.needsReconciliation = true;
      recipe.version++;
      recipe.updatedAt = now;
      break;
    }
    case 'start_meal': {
      if (meal && meal.stage !== 'finished') {
        if (!a.replaceConfirmed) throw new Error('Confirm replacing the active meal.');
        if (meal.timers.some((t) => t.status === 'running'))
          throw new Error('Cancel or acknowledge active timers before replacing this meal.');
      }
      const recipe = state.recipes.find((r) => r.id === a.recipeId);
      if (!recipe) throw new Error('Recipe not found.');
      if (!recipe.steps.length) throw new Error('Add the agreed recipe method before preparation.');
      if (recipe.needsReconciliation)
        throw new Error(
          'Reconcile cooking instructions with the accepted ingredients before preparation.'
        );
      requireAcceptedIngredients(state, recipe.id, recipe);
      state.meal = {
        id: cmd.commandId,
        recipeId: recipe.id,
        recipeVersion: recipe.version,
        recipe: recipeInput.parse(recipe),
        stage: 'prep',
        completed: [],
        startedAt: null,
        finishedAt: null,
        timers: [],
      };
      (state.ingredientChecks ??= {})['active-meal'] = structuredClone(
        ingredientCheck(state, recipe.id, recipe)
      );
      break;
    }
    case 'complete_step': {
      const m = requireMeal();
      if (m.needsReconciliation)
        throw new Error(
          'Reconcile cooking instructions after ingredient changes before continuing.'
        );
      if (m.startedAt === null) requireAcceptedIngredients(state, 'active-meal', m.recipe);
      if (m.completed.includes(a.stepId)) break;
      if (currentStep(m)?.id !== a.stepId) throw new Error('Complete the current step first.');
      m.completed.push(a.stepId);
      break;
    }
    case 'start_cooking': {
      const m = requireMeal();
      if (m.needsReconciliation)
        throw new Error(
          'Reconcile cooking instructions after ingredient changes before continuing.'
        );
      if (m.startedAt !== null) break;
      requireAcceptedIngredients(state, 'active-meal', m.recipe);
      if (!m.recipe.steps.some((step) => step.stage === 'cook'))
        throw new Error('This recipe has no cooking stage. Continue to plating after preparation.');
      if (m.stage !== 'prep' || currentStep(m))
        throw new Error('Complete preparation before starting cooking.');
      m.stage = 'cook';
      m.startedAt = now;
      break;
    }
    case 'start_plating': {
      const m = requireMeal();
      if (m.needsReconciliation)
        throw new Error('Reconcile cooking instructions before continuing.');
      if (m.stage === 'plate') break;
      const noCook = !m.recipe.steps.some((step) => step.stage === 'cook');
      if ((m.stage !== 'cook' && !(m.stage === 'prep' && noCook)) || currentStep(m))
        throw new Error('Complete the remaining recipe actions before plating.');
      m.stage = 'plate';
      break;
    }
    case 'edit_meal': {
      const m = requireMeal();
      if (!a.confirmed) throw new Error('Confirm the recipe change first.');
      const current = currentStep(m);
      if (m.startedAt !== null) {
        const protectedIds = new Set([...m.completed, ...(current ? [current.id] : [])]);
        for (const step of m.recipe.steps.filter((s) => protectedIds.has(s.id))) {
          if (JSON.stringify(a.recipe.steps.find((s) => s.id === step.id)) !== JSON.stringify(step))
            throw new Error('Completed and current steps cannot be rewritten during cooking.');
        }
        if (a.recipe.servings !== m.recipe.servings)
          throw new Error('Change servings before cooking.');
        if (m.timers.some((t) => t.stepId && !a.recipe.steps.some((s) => s.id === t.stepId)))
          throw new Error('Keep steps associated with existing timers.');
      } else {
        for (const step of m.recipe.steps.filter((s) => m.completed.includes(s.id))) {
          if (JSON.stringify(a.recipe.steps.find((s) => s.id === step.id)) !== JSON.stringify(step))
            throw new Error('Keep completed preparation steps unchanged.');
        }
        if (m.timers.some((t) => t.stepId && !a.recipe.steps.some((s) => s.id === t.stepId)))
          throw new Error('Keep steps associated with existing timers.');
      }
      const changedIngredients =
        JSON.stringify([m.recipe.servings, m.recipe.ingredients]) !==
        JSON.stringify([a.recipe.servings, a.recipe.ingredients]);
      if (a.reconciled) {
        if (changedIngredients)
          throw new Error('Accept the changed ingredient list before reconciling instructions.');
        requireAcceptedIngredients(state, 'active-meal', m.recipe);
      }
      m.needsReconciliation = a.reconciled
        ? false
        : changedIngredients || m.needsReconciliation || false;
      m.recipe = structuredClone(a.recipe);
      break;
    }
    case 'save_meal_recipe': {
      const m = requireMeal();
      if (m.needsReconciliation)
        throw new Error('Reconcile the meal instructions before saving to My Recipes.');
      const r = state.recipes.find((r) => r.id === m.recipeId);
      if (!r) throw new Error('Saved recipe no longer exists.');
      Object.assign(r, structuredClone(m.recipe), {
        id: r.id,
        version: r.version + 1,
        updatedAt: now,
        needsReconciliation: false,
      });
      m.recipeVersion = r.version;
      break;
    }
    case 'create_timer': {
      const m = meal && meal.stage !== 'finished' ? meal : null;
      const timers = m ? m.timers : (state.timers ??= []);
      if (a.stepId && !m?.recipe.steps.some((s) => s.id === a.stepId))
        throw new Error('Timer step not found.');
      if (
        [...(state.timers ?? []), ...(meal?.timers ?? [])].some(
          (t) => t.status === 'running' && t.label.toLowerCase() === a.label.toLowerCase()
        )
      )
        throw new Error('A timer with this name already exists. Choose a different name.');
      if (timers.length >= 100) throw new Error('This meal has reached its timer limit.');
      timers.push({
        id: cmd.commandId,
        label: a.label,
        deadline: now + a.seconds * 1000,
        status: 'running',
        ...(a.stepId ? { stepId: a.stepId } : {}),
      });
      break;
    }
    case 'cancel_timer':
    case 'acknowledge_timer': {
      const t = [...(state.timers ?? []), ...(meal?.timers ?? [])].find((t) => t.id === a.timerId);
      if (!t) throw new Error('Timer not found.');
      if (t.status !== 'running') break;
      if (a.type === 'acknowledge_timer' && t.deadline > now)
        throw new Error('This timer is not due yet.');
      t.status = a.type === 'cancel_timer' ? 'cancelled' : 'acknowledged';
      break;
    }
    case 'finish_meal': {
      if (meal?.stage === 'finished') break;
      const m = requireMeal();
      if (m.stage !== 'plate' || currentStep(m)) throw new Error('Complete plating first.');
      if (
        m.timers.some((t) => t.status === 'running' && t.deadline > now) &&
        !a.cancelTimersConfirmed
      )
        throw new Error('Confirm cancellation of remaining timers.');
      m.timers.forEach((t) => {
        if (t.status === 'running') t.status = t.deadline <= now ? 'acknowledged' : 'cancelled';
      });
      m.stage = 'finished';
      m.finishedAt = now;
      break;
    }
  }
  state.revision++;
  state.commands = [...state.commands.slice(-199), cmd.commandId];
  return state;
}
