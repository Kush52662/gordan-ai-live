'use client';

import { AgentPlan } from '@/components/assistant-ui/elements/agent-plan';
import { type Meal, type RecipeInput, executionProgress } from '@/lib/kitchen/model';

const labels = { prep: 'Preparation', cook: 'Cooking', plate: 'Plating' };

export function RecipeActionPlan({ recipe, meal }: { recipe: RecipeInput; meal?: Meal | null }) {
  const progress = meal ? executionProgress(meal) : undefined;
  return (
    <AgentPlan
      className="k-action-plan"
      title="Recipe plan"
      steps={recipe.steps.map((step, index) => ({
        id: step.id,
        label: `${index + 1}. ${step.instruction}`,
        description: labels[step.stage],
      }))}
      activeIndex={progress?.completedSteps ?? 0}
      paused={!progress?.currentStep}
    />
  );
}
