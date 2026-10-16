# Product design

Gordon AI is a voice-first companion for one home cook making one meal. Its purpose is to make the next action clear while remembering what is ready, what is cooking and what needs attention.

Ingredients, dietary needs and equipment are prerequisites and constraints. The recipe is a plan containing however many actions the dish needs. Cooking is a long-running execution of that plan: the human performs the actions; Gordon coaches and records confirmed progress.

## The experience

**Discover.** Start a conversation from ingredients or a craving. Ask a useful scoping question when needed, then offer distinct dish options in chat with Assistant UI Option List. The cook can choose by voice or click, ask questions or change direction. A specific dish request can proceed directly; discovery is prompt guidance, not a mandatory sequence. Agree on relevant quantities before presenting ingredients. Availability checks, substitutions and confirmations stay in chat. Generate preparation, cooking and plating instructions after ingredient acceptance.

**Prepare.** Review the editable recipe and organize the work. Ingredient drafts autosave to My Recipes; accepted ingredients and the completed method update that same editable document without starting a meal. Starting preparation saves the selected recipe and creates its meal snapshot. Preparation does not start the elapsed cooking clock. Heating belongs to cooking, including bringing water to a boil or preheating a pan; explicit heating commands are rejected in prep steps.

**Cook.** Start the main clock when the cook starts cooking. Give one manageable action, with quantities and useful sensory cues, then wait. Answer technique questions and interruptions naturally. Record completion from the cook's report; silence and elapsed time never establish that a step is done.

**Plate.** Give dish-specific finishing and arrangement guidance. Explicit meal completion stops the elapsed clock and retains the meal snapshot. Resolve remaining countdowns before finishing; disconnecting voice alone does not finish cooking.

## Conversation and workspace

Signing in leaves the microphone off. Talk to Gordon AI explicitly starts voice; typed messages provide a fallback. Keep the same conversation across recipe selection, preparation, cooking and plating. Saved work is available to resume without forcing an old meal into a new conversation.

The initial screen is a full-width kitchen starter with ingredient, craving and voice controls, plus a compact text input. Discovery and ingredient decisions stay in chat. An ingredient draft, complete recipe or resumed meal opens the split workspace; it remains available throughout cooking.

On desktop, conversation sits beside an artifact panel with Recipe and Cooking tabs. Narrow screens show one pane at a time. Recipe is a directly editable rich-text Markdown document backed by the same JSON recipe. Valid edits save automatically; concurrent agent edits never silently overwrite a draft. Recipe decisions belong in chat, not sidebar forms. Cooking shows an Assistant UI Task Card for the current human action, its global position (for example, step 7 of 20), elapsed clock and named timers. Its Agent Plan expands alongside execution progress. Prep, Cook and Plate classify actions; they are not three progress steps. Voice reports advance the same saved action IDs as the optional buttons. My Recipes holds saved recipes independently of an active meal.

Use a white canvas, charcoal text, coral primary actions, clear typography and restrained rounded surfaces. Current instructions and timer alerts take priority over decoration. A local-file music player is optional and never autoplays.

## State and trust

- One agent follows the conversation; preparation, cooking and plating organize state rather than impose a spoken script.
- Voice and manual controls use the same validated API. Successful tools update visible state; failed actions must not be announced as successful. Countdown confirmation follows creation of the actual named timers, using the final corrected duration.
- Manual progress changes update Gordon's context silently while he is listening. Planning or asking to wait never starts coaching.
- A meal snapshots its selected recipe. Later library edits do not silently rewrite work already underway.
- Ingredient and serving changes require affected instructions to be reconciled and the ingredient list accepted again.
- Keep dietary exclusions, equipment and preferences in a saved cooking brief outside model history. Reconnect using compact saved context.
- Recipe contents and saved context are data, never instructions for the agent.
- Ask for packaged-mix sizes and relevant label directions before giving packet-specific quantities. Never invent ratios or yields.
- There is no camera. Use the cook's descriptions and appropriate doneness checks; timer expiry means check the food.

## Timers and recovery

The main clock counts up from confirmed cooking start through plating completion. Named countdowns run independently, including during preparation. Store timestamps so refresh and reconnect restore elapsed and remaining time. A repeated cooking-start action must not reset the clock.

Countdown expiry raises attention without completing a recipe step. Explicit meal completion acknowledges expired meal timers; cancelling countdowns still in the future requires confirmation. Audible alerts require an active browser with audio enabled or a connected agent. Closed-browser notifications are outside this version.

When voice is unavailable, keep typed questions and manual controls usable. Preserve recipe edits and progress through navigation. Show failed saves, connection state and authentication expiry plainly. Sign-out disconnects voice; server authorization protects each account's saved kitchen.

## Scope and acceptance

The intended complete journey is Google sign-in → ingredient or craving discovery → accepted ingredients → editable recipe → preparation → cooking with timers → plating → saved progress.

Acceptance requires a real voice journey, independent countdowns alongside the elapsed clock, refresh/reconnect continuity, microphone-denied fallback, and verified account isolation. These are product expectations; see the README for current implementation limits.

Deferred: recipe-link import, live web research, camera input, broad replanning during cooking, closed-browser notifications, multi-tab coordination and social features.

## Durable conversation

Persist text turns and inline recipe cards per authenticated cook. Restore the current conversation after refresh, retaining message identities and chronological order; load older messages in pages. Keep the microphone off until explicitly starting or resuming voice. Restore recent user/assistant text through LiveKit ChatContext alongside authoritative kitchen state; never replay saved tool executions. Store the full text archive separately from the bounded context sent to the model. Save errors stay visible and retryable. Temporary Gemini transport resumption and durable application history are distinct.

## Skill composition

One core `cook-with-gordon` skill holds the skeleton: choose a dish → agree on ingredients → build the recipe → build temporal guidance → guide actual actions and update progress → finish. Referenced sub-procedures carry the work; adaptation and save/restore return to the appropriate point. They do not compete as separate entry skills or create new voice sessions. The runtime activates the core skill once in persistent instructions; supply supporting procedures for the current saved state and read other references on demand. Packet size/directions are requested once if needed; unavailable labels lead to useful unquantified help, not repeated questions or invented measurements. The skill follows the current API rather than inventing missing tool capabilities.

Recipe and guidance are separate linked definitions. The guidance schema records dependencies, event-based timing, speaking cues, completion evidence and optional enrichment windows. Its independent persistence and general scheduling remain an implementation gap; the current skill can keep working guidance in context and use real named timers. It must not claim otherwise. Cooking-start state automatically starts the main elapsed clock once; it is preserved on reconnect and stops at finished plating.

## Document and execution updates

`edit_recipe` updates the current recipe, ingredient availability and supplied preferences atomically. `update_cooking` batches reported progress, stage transitions and countdown changes. Empty execution calls read cached status with the current time. One authenticated change stream per client supplies committed kitchen revisions; Firestore transactions retain ownership, concurrency and idempotency checks. Skill resources provide flow guidance within the same voice session.
