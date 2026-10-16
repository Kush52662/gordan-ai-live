# Agree on ingredients in the live document

Use `edit_recipe` with `createNew=true` for a new dish: patch title, servings, quantified ingredients and `steps=[]`. The returned document ID remains the same throughout ingredient review, method generation, edits and autosaving. For changes, patch only the affected fields; never resend an unchanged complete recipe.

Record supplied facts with `preferences` in the same call. Preserve known allergies. `checks` uses current ingredient row indexes and unknown/yes/no; yes includes the quantity. `acceptIngredients=true` records agreement to the exact current list. Availability and acceptance can be combined when clearly supplied. A quantity-only answer is not permission to start cooking. Unchanged rows keep their availability when another ingredient changes.

For packaged mixes, ask once for size and liquid directions together. If unreadable or unknown, provide ingredient names, equipment and a quantity-free overview. Do not invent batch quantities, treat piece count as servings, or repeat the unavailable question. No quantified document is needed until measurements can be grounded.

**Return:** Same document with accepted ingredients. Add its [method](build-recipe.md), or continue discussing substitutions.

[Contracts](contracts.md)
