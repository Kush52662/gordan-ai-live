# Autosave and resume

Every `edit_recipe` change is already saved. Do not issue an additional save action or imply cooking began. A newly chosen dish uses createNew=true; ongoing edits keep its ID. To select another saved document, use its recipeId with no patch. The returned context includes the full selected document, so later edits need no preliminary reads.

Restore current document, ingredient agreement, stable completed step IDs, elapsed start and countdown deadlines. The voice call and cooking progress are separate: disconnecting is not finishing, and reconnection does not reset the clock or force resumption.

For saving for tomorrow, agree ingredients, add the method and stop. For a request to begin, use [guidance](guide-meal.md). Missing working guidance can be reconstructed from the durable recipe/progress; do not claim separately stored guidance plans.
