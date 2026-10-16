'use client';

import { useState } from 'react';
import { Check, ChevronDown, ShoppingBasket } from 'lucide-react';
import { ThreadPrimitive } from '@assistant-ui/react';
import {
  type Availability,
  type IngredientPlan,
  ingredientCheck,
  recipeFingerprint,
  recipeForCheck,
} from '@/lib/kitchen/model';
import type { KitchenController } from './use-kitchen';

export function IngredientChecklist({
  recipe,
  recipeId,
  controller,
  onDecision,
}: {
  recipe: IngredientPlan;
  recipeId: string;
  controller: KitchenController;
  onDecision?: (message: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const { kitchen, busy, act } = controller;
  if (!kitchen) return null;
  const current = recipeForCheck(kitchen, recipeId);
  const editable = !!current && recipeFingerprint(current) === recipeFingerprint(recipe);
  const check = ingredientCheck(kitchen, recipeId, recipe);
  const missing = recipe.ingredients.filter((_, index) => check.available[index] === 'no');
  const confirmed = check.available.filter((value) => value === 'yes').length;
  const update = (checks: { index: number; availability: Availability }[], accept = false) =>
    act({
      type: 'check_ingredients',
      recipeId,
      fingerprint: recipeFingerprint(recipe),
      checks,
      accept,
    });
  return (
    <section
      className="k-chat-ingredient-check"
      aria-label={`Ingredient discussion for ${recipe.title}`}
    >
      <div className="k-ingredient-heading">
        <span className="k-ingredient-icon">
          <ShoppingBasket size={20} />
        </span>
        <div>
          <h3>{recipe.title}</h3>
          <p>
            {recipe.servings} servings · {recipe.ingredients.length} ingredients
          </p>
        </div>
      </div>
      <div className="k-ingredient-status" data-accepted={check.accepted} role="status">
        {check.accepted ? (
          <>
            <Check size={14} /> Ingredients confirmed
          </>
        ) : (
          `${confirmed} of ${recipe.ingredients.length} available${missing.length ? ` · ${missing.length} missing` : ''}`
        )}
      </div>
      <button
        className="k-ingredient-disclosure"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <span>{expanded ? 'Hide ingredients' : 'Review ingredients'}</span>
        <ChevronDown size={16} />
      </button>
      {!expanded && (
        <p className="k-ingredient-preview">
          {recipe.ingredients
            .slice(0, 3)
            .map((i) => i.name)
            .join(', ')}
          {recipe.ingredients.length > 3 ? ` +${recipe.ingredients.length - 3} more` : ''}
        </p>
      )}
      {expanded && (
        <div className="k-ingredient-rows">
          {recipe.ingredients.map((ingredient, index) => (
            <label
              className="k-chat-ingredient"
              key={index}
              data-availability={check.available[index]}
            >
              <span>
                <strong>{ingredient.name}</strong>
                <small>
                  {ingredient.amount} {ingredient.unit}
                </small>
              </span>
              <select
                aria-label={`Availability of ${ingredient.name}`}
                value={check.available[index]}
                disabled={busy || !editable}
                onChange={(event) =>
                  void update([{ index, availability: event.target.value as Availability }]).catch(
                    () => {}
                  )
                }
              >
                <option value="unknown">Check</option>
                <option value="yes">Have enough</option>
                <option value="no">Missing</option>
              </select>
            </label>
          ))}
        </div>
      )}
      {!editable ? (
        <p className="k-muted">Earlier ingredient list. Continue with the latest list in chat.</p>
      ) : (
        <>
          {!check.accepted && (
            <button
              className="k-button k-primary k-ingredient-accept"
              disabled={busy || missing.length > 0}
              onClick={() =>
                void (async () => {
                  await update(
                    recipe.ingredients.map((_, index) => ({ index, availability: 'yes' })),
                    true
                  );
                  if (onDecision)
                    await onDecision(
                      `I accept the listed ingredients and quantities for ${recipe.title}. Build its recipe, but don't start preparation yet.`
                    );
                })().catch(() => {})
              }
            >
              {busy
                ? 'Updating…'
                : confirmed === recipe.ingredients.length
                  ? 'Use these ingredients'
                  : 'I have everything · Use this list'}
            </button>
          )}
          {missing.length > 0 && (
            <div className="k-missing-options">
              <p className="k-muted">
                Missing {missing.map((i) => i.name).join(', ')}? Let’s adapt it.
              </p>
              <ThreadPrimitive.Suggestion
                className="k-suggestion"
                send
                prompt={`I'm missing ${missing.map((i) => i.name).join(', ')} for ${recipe.title}. Help me choose suitable substitutes, respecting my dietary needs. Ask what I have before replacing anything.`}
              >
                Suggest substitutes
              </ThreadPrimitive.Suggestion>
              <ThreadPrimitive.Suggestion
                className="k-suggestion"
                send
                prompt={`Can we make ${recipe.title} without ${missing.map((i) => i.name).join(', ')}? Discuss whether it will work before revising the ingredients.`}
              >
                Leave these out?
              </ThreadPrimitive.Suggestion>
              <ThreadPrimitive.Suggestion
                className="k-suggestion"
                send
                prompt="Let's explore some different dishes instead. Don't change an active meal."
              >
                Explore another dish
              </ThreadPrimitive.Suggestion>
            </div>
          )}
        </>
      )}
    </section>
  );
}
