'use client';

import { FileText, LayoutDashboard, X } from 'lucide-react';
import * as Tabs from '@radix-ui/react-tabs';
import type { IngredientPlan, Recipe, RecipeInput } from '@/lib/kitchen/model';
import { IngredientChecklist } from './ingredient-checklist';
import { KitchenDashboard } from './kitchen-dashboard';
import { RecipeDocument } from './recipe-document';
import type { KitchenController } from './use-kitchen';

export type Editor = 'new' | 'meal' | Recipe | { choice: RecipeInput } | null;
export function RecipePanel({
  view,
  showDashboard = true,
  onViewChange,
  open,
  onOpenChange,
  target,
  previewChoices,
  editor,
  setEditor,
  onSelect,
  controller,
}: {
  view: string;
  showDashboard?: boolean;
  onViewChange: (value: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: string | null;
  previewChoices?: RecipeInput[];
  previewPlans?: IngredientPlan[];
  onSelect: (id: string) => void;
  onMealStarted: () => void;
  editor: Editor;
  setEditor: (editor: Editor) => void;
  controller: KitchenController;
}) {
  const { kitchen } = controller;
  const meal = target === 'meal' || editor === 'meal' ? kitchen?.meal : null;
  const saved = kitchen?.recipes.find((r) => r.id === target);
  const choice = target?.startsWith('choice:')
    ? (previewChoices ?? kitchen?.choices)?.[Number(target.split(':')[1])]
    : undefined;
  const source =
    editor && typeof editor === 'object'
      ? 'choice' in editor
        ? editor.choice
        : (kitchen?.recipes.find((r) => r.id === editor.id) ?? editor)
      : (meal?.recipe ?? saved ?? choice);
  const recipeId =
    editor === 'new'
      ? undefined
      : meal
        ? 'active-meal'
        : editor && typeof editor === 'object' && 'id' in editor
          ? editor.id
          : (target ?? undefined);
  return (
    <aside className="k-recipe-panel" hidden={!open} aria-label="Recipe workspace">
      <Tabs.Root value={view} onValueChange={onViewChange} className="k-panel-tabs">
        <header className="k-panel-header">
          <Tabs.List aria-label="Recipe workspace views" className="k-panel-tab-list">
            <Tabs.Trigger value="recipe">
              <FileText size={15} /> Recipe
            </Tabs.Trigger>
            {showDashboard && (
              <Tabs.Trigger value="dashboard">
                <LayoutDashboard size={15} /> Cooking
              </Tabs.Trigger>
            )}
          </Tabs.List>
          <button
            className="k-icon-button"
            onClick={() => onOpenChange(false)}
            aria-label="Close recipe workspace"
          >
            <X size={18} />
          </button>
        </header>
        <Tabs.Content value="recipe" className="k-panel-content" forceMount>
          <article className="k-recipe-document">
            {source || editor === 'new' ? (
              <>
                {(meal?.needsReconciliation || saved?.needsReconciliation) && (
                  <p className="k-document-notice" role="status">
                    Ingredients changed. Discuss the updated method with Gordon in chat before
                    continuing.
                  </p>
                )}
                {source && recipeId && !source.steps.length && (
                  <IngredientChecklist
                    recipe={source}
                    recipeId={recipeId}
                    controller={controller}
                  />
                )}
                <RecipeDocument
                  key={recipeId ?? 'new'}
                  recipe={editor === 'new' ? undefined : source}
                  recipeId={recipeId}
                  controller={controller}
                  onSaved={(id) => {
                    setEditor(null);
                    onSelect(id);
                  }}
                />
              </>
            ) : (
              <div className="k-document-empty">
                <FileText size={28} strokeWidth={1.3} />
                <h2>Your recipe, when you’re ready</h2>
                <p>
                  Explore dishes and ingredients with Gordon in chat. Your agreed recipe appears
                  here as an editable document.
                </p>
              </div>
            )}
          </article>
        </Tabs.Content>
        {showDashboard && (
          <Tabs.Content value="dashboard" className="k-panel-content" forceMount>
            <KitchenDashboard
              controller={controller}
              onOpenMeal={() => {
                onSelect('meal');
                onViewChange('recipe');
              }}
            />
          </Tabs.Content>
        )}
      </Tabs.Root>
      {controller.error && (
        <div className="k-panel-error" role="alert">
          {controller.error}
        </div>
      )}
    </aside>
  );
}
