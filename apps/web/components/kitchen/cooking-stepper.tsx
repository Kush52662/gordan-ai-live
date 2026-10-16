'use client';

import { TaskCard } from '@/components/assistant-ui/elements/task-card';
import { executionProgress, ingredientsAccepted } from '@/lib/kitchen/model';
import { RecipeActionPlan } from './recipe-action-plan';
import { RichInstruction } from './rich-instruction';
import type { KitchenController } from './use-kitchen';

const labels = { prep: 'Prep', cook: 'Cook', plate: 'Plate' };

export function CookingStepper({ controller }: { controller: KitchenController }) {
  const { kitchen, act, busy, now } = controller;
  const meal = kitchen?.meal;
  if (!meal) return null;
  const finished = meal.stage === 'finished';
  const hasCooking = meal.recipe.steps.some((step) => step.stage === 'cook');
  const progress = executionProgress(meal);
  const step = progress.currentStep;
  const blocked =
    !!meal.needsReconciliation ||
    (meal.stage === 'prep' && !ingredientsAccepted(kitchen, 'active-meal', meal.recipe));
  function advance() {
    if (!meal || finished || blocked) return;
    const action = step
      ? { type: 'complete_step' as const, stepId: step.id }
      : meal.stage === 'prep'
        ? hasCooking
          ? { type: 'start_cooking' as const }
          : { type: 'start_plating' as const }
        : meal.stage === 'cook'
          ? { type: 'start_plating' as const }
          : { type: 'finish_meal' as const, cancelTimersConfirmed: false };
    if (
      action.type === 'finish_meal' &&
      meal.timers.some((timer) => timer.status === 'running' && timer.deadline > now)
    ) {
      if (!window.confirm('Finish the meal and cancel remaining countdowns?')) return;
      action.cancelTimersConfirmed = true;
    }
    void act(action).catch(() => {});
  }
  return (
    <section className="k-cooking-execution" aria-label="Recipe execution">
      <div className="k-execution-progress">
        <progress
          aria-label="Recipe steps completed"
          value={progress.completedSteps}
          max={Math.max(1, progress.totalSteps)}
        />
        <span>
          {progress.completedSteps}/{progress.totalSteps} complete
        </span>
      </div>
      <div className="k-current-action" aria-live="polite" aria-atomic="true">
        <TaskCard
          className="k-execution-card"
          label={
            finished
              ? 'Meal complete'
              : blocked
                ? 'Update the recipe plan'
                : step
                  ? `Step ${progress.currentStepNumber} of ${progress.totalSteps}`
                  : progress.nextStep
                    ? `Ready for step ${progress.nextStepNumber} of ${progress.totalSteps}`
                    : 'All recipe steps done'
          }
          meta={
            finished
              ? `${progress.completedSteps}/${progress.totalSteps} done`
              : labels[meal.stage as keyof typeof labels]
          }
          state={finished ? 'done' : 'waiting'}
          result={
            <div className="k-current-instruction">
              {blocked ? (
                <p>Review the ingredient list and updated instructions before continuing.</p>
              ) : finished ? (
                <p>Ready to enjoy. Your cooking time and progress are saved.</p>
              ) : step ? (
                <RichInstruction key={step.id + step.instruction} value={step.instruction} />
              ) : (
                <p>
                  {meal.stage === 'prep'
                    ? hasCooking
                      ? 'Prep is ready. Tell Gordon when you’re ready to cook.'
                      : 'Prep is ready. Ready to plate?'
                    : meal.stage === 'cook'
                      ? 'Cooking is complete. Ready to plate?'
                      : 'Plating is complete. Tell Gordon when you’re finished.'}
                </p>
              )}
            </div>
          }
          actions={
            !finished && !blocked ? (
              <>
                <p className="k-muted">Your action. Tell Gordon when you’re done or need help.</p>
                <button className="k-button k-button-small" disabled={busy} onClick={advance}>
                  {step
                    ? 'Done, next step'
                    : meal.stage === 'prep'
                      ? hasCooking
                        ? 'Start cooking'
                        : 'Ready to plate'
                      : meal.stage === 'cook'
                        ? 'Ready to plate'
                        : 'Finish meal'}
                </button>
              </>
            ) : undefined
          }
        />
      </div>
      <details className="k-execution-plan">
        <summary>
          {progress.completedSteps} of {progress.totalSteps} steps done · View full recipe plan
        </summary>
        <RecipeActionPlan recipe={meal.recipe} meal={meal} />
      </details>
    </section>
  );
}
