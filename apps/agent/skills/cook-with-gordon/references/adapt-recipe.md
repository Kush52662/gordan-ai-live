# Edit requested changes

A technique question can receive a conversational answer. An explicit request to keep a change uses `edit_recipe` to patch the relevant steps or notes in the existing document. Confirm saving only after success. Omitted fields and stable step IDs remain unchanged.

An ingredient or serving change invalidates agreement and removes a stale draft method. Preserve unchanged availability, agree on changed quantities, then add the updated method to the same document. For an active meal use recipeId=active-meal and preserve protected completed/current work; do not edit the library instead of the active meal. Requested method changes must respect work already done.

Existing timers are independent real side effects; ask before cancellation. Rebuild affected working guidance, without restarting the conversation or elapsed clock.

[Ingredient agreement](agree-ingredients.md) · [Contracts](contracts.md)
