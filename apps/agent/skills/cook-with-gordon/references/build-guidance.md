# Build the temporal guidance plan

**Entry:** Invoked after recipe creation or when a recipe edit makes its future guidance outdated.

Construct the guidance plan against the recipe's stable action IDs and version using the [guidance-plan schema](guidance-plan.schema.json). The recipe explains the method; guidance specifies when to speak, wait, check and update progress.

For each action, identify dependencies, hands-on or waiting work, a real start event, an expected duration where useful, completion evidence and concise coaching cues. Anchor timing to an established event such as food entering the pan, rather than the time the recipe was generated. Plan parallel work only where attention and equipment allow it. A timer can prompt a check; it does not establish doneness.

Mark waiting windows where brief enrichment could help: a technique tip, ingredient explanation or sourced culinary background. Enrichment is optional and yields to questions, safety checks and due timers. Historical attribution needs a supporting source; omit uncertain origin claims. The cook can prefer quiet.

**Return:** A working guidance plan linked to the recipe and a next eligible action. Continue with [guide the meal](guide-meal.md). On revision, preserve completed work and replace affected future guidance.

**Runtime boundary:** Read [guidance support](contracts.md#guidance-plan-support). The current tools do not persist a separate guidance artifact or schedule generic check-ins. Keep working guidance in the conversation, use real named timers where appropriate, and do not claim unscheduled check-ins or independent persistence.
