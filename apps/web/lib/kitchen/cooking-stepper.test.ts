import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { CookingStepper } from '@/components/kitchen/cooking-stepper';
import type { KitchenController } from '@/components/kitchen/use-kitchen';
import { agentContext } from './context';
import {
  type Action,
  emptyKitchen,
  executionProgress,
  recipeFingerprint,
  transition,
} from './model';

vi.mock('@/components/kitchen/rich-instruction', () => ({
  RichInstruction: ({ value }: { value: string }) => value,
}));

it('tracks all actions for 3- and 20-step plans, keeping UI and voice on the same action', () => {
  for (const total of [3, 20]) {
    let kitchen = emptyKitchen();
    const recipe = {
      title: `${total}-action recipe`,
      servings: 2,
      ingredients: [{ name: 'cauliflower', amount: 500, unit: 'g' }],
      steps: Array.from({ length: total }, (_, index) => ({
        id: `action-${index + 1}`,
        stage: (index < (total === 20 ? 6 : 1)
          ? 'prep'
          : index < total - (total === 20 ? 2 : 1)
            ? 'cook'
            : 'plate') as 'prep' | 'cook' | 'plate',
        instruction: `Recipe action ${index + 1}.`,
      })),
    };
    const apply = (action: Action) => {
      kitchen = transition(kitchen, {
        action,
        revision: kitchen.revision,
        commandId: crypto.randomUUID(),
      });
    };
    apply({ type: 'save_recipe', recipe });
    const recipeId = kitchen.recipes[0].id;
    apply({
      type: 'check_ingredients',
      recipeId,
      fingerprint: recipeFingerprint(recipe),
      checks: [{ index: 0, availability: 'yes' }],
      accept: true,
    });
    apply({ type: 'start_meal', recipeId });
    const render = () =>
      renderToStaticMarkup(
        createElement(CookingStepper, {
          controller: {
            kitchen,
            now: Date.now(),
            act: vi.fn(),
            busy: false,
          } as unknown as KitchenController,
        })
      );
    let startedAt: number | null = null;
    for (const [index, step] of recipe.steps.entries()) {
      if (step.stage !== kitchen.meal!.stage) {
        expect(executionProgress(kitchen.meal!).currentStepNumber).toBeNull();
        expect(render()).toContain(`Ready for step ${index + 1} of ${total}`);
        expect(render()).not.toContain('aria-current="step"');
        apply({ type: step.stage === 'cook' ? 'start_cooking' : 'start_plating' });
        startedAt ??= kitchen.meal!.startedAt;
      }
      const html = render();
      expect(html).toContain('data-slot="agent-plan"');
      expect(html).toContain('data-slot="task-card"');
      expect(html).toContain(`Step ${index + 1} of ${total}`);
      expect(html).toContain(`aria-valuetext="${index} of ${total} steps"`);
      expect(html.match(/<li\b/g)).toHaveLength(total);
      expect(agentContext(kitchen).meal!.execution).toMatchObject({
        executor: 'cook',
        totalSteps: total,
        completedSteps: index,
        currentStepNumber: index + 1,
      });
      expect(agentContext(kitchen).meal!.currentStep!.id).toBe(step.id);
      expect(kitchen.meal!.completed).toHaveLength(index);
      apply({ type: 'complete_step', stepId: step.id });
    }
    expect(kitchen.meal!.finishedAt).toBeNull();
    apply({ type: 'finish_meal', cancelTimersConfirmed: false });
    expect(render()).toContain('Meal complete');
    expect(render()).toContain(`aria-valuetext="${total} of ${total} steps"`);
    expect(kitchen.meal!.startedAt).toBe(startedAt);
    expect(kitchen.meal!.finishedAt).not.toBeNull();
  }
});

it('offers plating after preparation for a cold recipe, without a synthetic cooking stage', () => {
  let kitchen = emptyKitchen();
  const recipe = {
    title: 'Cucumber salad',
    servings: 2,
    ingredients: [{ name: 'cucumber', amount: 1, unit: 'whole' }],
    steps: [
      { id: 'dice', stage: 'prep' as const, instruction: 'Dice cucumber.' },
      { id: 'serve', stage: 'plate' as const, instruction: 'Serve in bowls.' },
    ],
  };
  const apply = (action: Action) => {
    kitchen = transition(kitchen, {
      action,
      revision: kitchen.revision,
      commandId: crypto.randomUUID(),
    });
  };
  apply({ type: 'save_recipe', recipe });
  const recipeId = kitchen.recipes[0].id;
  apply({
    type: 'check_ingredients',
    recipeId,
    fingerprint: recipeFingerprint(recipe),
    checks: [{ index: 0, availability: 'yes' }],
    accept: true,
  });
  apply({ type: 'start_meal', recipeId });
  apply({ type: 'complete_step', stepId: 'dice' });
  const html = renderToStaticMarkup(
    createElement(CookingStepper, {
      controller: {
        kitchen,
        now: Date.now(),
        act: vi.fn(),
        busy: false,
      } as unknown as KitchenController,
    })
  );
  expect(html).toContain('Ready to plate');
  expect(html).not.toContain('Start cooking');
  apply({ type: 'start_plating' });
  apply({ type: 'complete_step', stepId: 'serve' });
  apply({ type: 'finish_meal', cancelTimersConfirmed: false });
  expect(kitchen.meal!.stage).toBe('finished');
  expect(kitchen.meal!.startedAt).toBeNull();
});
