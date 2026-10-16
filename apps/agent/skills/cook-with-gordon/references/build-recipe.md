# Add the method to the same document

After ingredient agreement, call `edit_recipe` with a patch containing steps and optional notes. Keep title, quantities and ingredient rows already in the document; do not copy them into the call again. This is an autosaved edit, not a separate generate/show/save workflow.

Use stable step IDs. Gathering, measuring, opening and chopping are prep. Every heating action, including boiling water or heating oil, is cook. Serving and arranging are plate. Cold dishes omit cook. Include useful equipment, timing and sensory/doneness cues in instructions or notes.

Briefly summarize the complete method when requested. Do not turn “give me the recipe” into instructions to start its first action. For tomorrow, leave execution unstarted. For “start prep”, use `update_cooking(event=begin_preparation)` before giving one manageable prep action.

**Return:** Same editable document with its method. Continue with [guidance](build-guidance.md).

Make the method executable without guesswork: specify useful cut sizes, equipment, heat, approximate time ranges and sensory endpoints. Account for every ingredient used in instructions, including oil, water and seasoning. Clarify unspecified “Indian spices” into the actual available spices and amounts rather than prescribing a tablespoon of an unknown mixture. Check portions when relevant instead of silently inventing them. Include the complete method through plating in one edit. Ingredient acceptance alone returns a ready recipe, not an unsolicited first prep command.
