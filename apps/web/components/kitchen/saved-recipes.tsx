'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, PanelRightOpen, Plus } from 'lucide-react';
import { type Editor, RecipePanel } from './recipe-panel';
import { useKitchen } from './use-kitchen';

function RecipeLibrary() {
  const controller = useKitchen();
  const router = useRouter();
  const [target, setTarget] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor>(null);
  const [open, setOpen] = useState(false);
  function select(id: string) {
    setTarget(id);
    setEditor(null);
    setOpen(true);
  }
  return (
    <div className="k-app">
      <main className="k-main">
        <header className="k-header">
          <p>
            Gordon <span>AI</span>
          </p>
        </header>
        {controller.error && (
          <div className="k-error" role="alert">
            {controller.error}
          </div>
        )}
        <div className={`k-workspace ${open ? 'has-panel' : ''}`}>
          <section className="k-library" aria-label="My Recipes">
            <div className="k-section-title">
              <div>
                <h1>My Recipes</h1>
                <p>Good ideas, ready whenever you are.</p>
              </div>
              <button
                className="k-icon-button"
                aria-label="Write a recipe"
                disabled={!controller.kitchen}
                onClick={() => {
                  setTarget(null);
                  setEditor('new');
                  setOpen(true);
                }}
              >
                <Plus size={19} />
              </button>
            </div>
            {!controller.kitchen ? (
              <p role="status">Loading your saved recipes…</p>
            ) : controller.kitchen.recipes.length === 0 ? (
              <p className="k-empty-library">Recipes you save with Gordon AI will appear here.</p>
            ) : (
              controller.kitchen.recipes.map((recipe) => (
                <button className="k-artifact" key={recipe.id} onClick={() => select(recipe.id)}>
                  <span className="k-artifact-icon">
                    <FileText size={19} />
                  </span>
                  <span>
                    <strong>{recipe.title}</strong>
                    <small>{recipe.servings} servings · Saved</small>
                  </span>
                  <PanelRightOpen size={16} />
                </button>
              ))
            )}
          </section>
          <RecipePanel
            view="recipe"
            showDashboard={false}
            onViewChange={() => {}}
            open={open}
            onOpenChange={setOpen}
            target={target}
            onSelect={select}
            onMealStarted={() => router.push('/?resume=meal')}
            editor={editor}
            setEditor={setEditor}
            controller={controller}
          />
        </div>
      </main>
    </div>
  );
}

export function SavedRecipes() {
  return <RecipeLibrary />;
}
