# Record execution in one update

Use `update_cooking` to combine completedStepIds with cooking_started, plating_started or meal_finished. Its atomic update validates ordering and preserves timestamps. begin_preparation selects the current document or an explicit recipeId. stageComplete=true only summarizes explicitly reported completed work.

A statement of future intention is not completion. After a successful response, use the returned action and progress; do not narrate persistence. A failed action has not advanced state. The current document and execution are already loaded and pushed when changed—do not fetch them before each action.

[Guidance](guide-meal.md) · [Contracts](contracts.md)

## A completed-prep handoff

After a saved prep action, “I've completed it, good to go” means record that work and proceed when it clearly covers all prep: `update_cooking({event:"cooking_started",stageComplete:true})`. Only then coach the first heating action. If only part of prep is done, send its actual `completedStepIds` and continue the remaining prep without discarding progress.

If no meal exists because prior spoken prep was not recorded, recover in two quiet calls: `begin_preparation` for the selected document, then record the work already reported and `cooking_started` when the cook is ready. Creating prep alone does not account for work already done. Use real step IDs and returned state; do not reset an existing meal, infer unrelated steps finished, or ask the cook to redo completed work. If the transition fails, resolve it before giving the next stage's instructions.

During cooking, completion of one action is recorded before coaching the next. Keep the original elapsed timestamp and running countdowns across technique questions, pauses, reconnect and plating. “How long?” never marks an action complete.

Use the recipe's own endpoint as evidence: “cumin is fragrant and the onions are in” completes the cumin action; “onions are soft and translucent” completes the onion action. Send the matching current `completedStepIds` quietly, then use the returned current action. A report may cover several consecutive actions; record those in order, but never unrelated work. A question alone does not complete an action, and “still cooking” does not finish it. If history shows a completed action whose save was missed, catch it up without restarting the clock or asking for the report again.
