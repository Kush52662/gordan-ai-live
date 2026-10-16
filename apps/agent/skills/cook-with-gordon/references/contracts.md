# Runtime contract

Two application tools stay registered throughout one Gemini Live session over LiveKit:

- `edit_recipe`: partial document patch, availability checks, ingredient acceptance, optional supplied preferences and optional dish suggestions. createNew starts a new document; otherwise keep its ID. Every edit autosaves in one authenticated API request and Firestore transaction. An ingredient-only draft has steps=[]; adding a method updates that same document.
- `update_cooking`: batch reported completed steps, a stage event and named timer operations in one authenticated API request/transaction. Calling without changes reads the cached current state with a fresh now, without HTTP. Timers use real deadlines. Cooking-start sets elapsed time once; meal completion stops it.

`load_skill` reads bundled supporting references; it is not a kitchen API request. The core and relevant supporting procedures are supplied by the runtime. Authenticated server-sent events deliver revisions to the agent and web app, replacing periodic polling. Optimistic revision conflicts preserve concurrent edits rather than silently overwriting them; inspect the refreshed context and reapply only the intended change.

Recipes use title, servings, ingredients[{name,amount,unit}], steps[{id,stage,instruction}] and optional notes. Ingredient drafts have no method; complete methods have prep and plate, with cook only when needed. Checks use row indexes and availability unknown/yes/no. Acceptance belongs to the ingredient fingerprint. Execution cannot begin on a draft or unaccepted list. Method-only edits preserve ingredient agreement.

Durable state includes document versions, ingredients, recipes, progress, elapsed timestamps and timers. The [guidance-plan schema](guidance-plan.schema.json) remains an integration contract; separate guidance-plan persistence and general scheduled check-ins are not implemented. Do not fabricate them. Gemini manages server-side compaction; active instructions contain the core/current guidance and other references can be re-read.

Sources: [Agent Skills](https://agentskills.io/client-implementation/adding-skills-support), [ElevenLabs procedures](https://elevenlabs.io/docs/eleven-agents/customization/procedures/free-form-procedures), [LiveKit speech instructions](https://docs.livekit.io/agents/multimodality/audio/#how-instructions-interact-with-session-level-instructions). Source contracts: apps/web/lib/kitchen/model.ts and apps/agent/src/kitchen.ts.
