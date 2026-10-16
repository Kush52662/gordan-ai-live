# Flow examples and evaluation cases

| Situation                           | Expected use of the main procedure                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| “I have eggs and potatoes.”         | Choose a dish, then agree on quantities. The cook remains free to explore.                                                                 |
| “I want tomato pasta for two.”      | Enter ingredient agreement directly; reuse the dish and portions.                                                                          |
| “Why are we salting the water?”     | Answer in context; no fresh recipe, ingredient review or greeting.                                                                         |
| “I have everything; use this list.” | Record acceptance for the current list, build its recipe and working guidance.                                                             |
| “Save this; I'm not cooking now.”   | Save the recipe and pause; preparation and the cooking clock stay unstarted.                                                               |
| “The onions are in the pan.”        | In an agreed meal, establish the cooking action and start the main clock if cooking begins.                                                |
| “Everything's chopped. Let's cook.” | Record reported prep completion and transition cooking; do not request a separate timer command.                                           |
| “Use half the quantity instead.”    | Adapt quantities and affected method/guidance; preserve completed work and real timers.                                                    |
| “I'll chop that.”                   | Keep the action incomplete until work is reported.                                                                                         |
| A confirmed waiting window          | Optional brief tip or sourced fact may fit; user speech and important checks take priority.                                                |
| “I cannot read the packet.”         | Ask for missing label details once; if unavailable, explain the unquantified plan and equipment without inventing amounts or asking again. |
| A countdown expires                 | Alert the cook to check the food, not that it is automatically cooked.                                                                     |
| “Continue from where we left off.”  | Restore saved progress/timestamps; rebuild missing working guidance without restarting the recipe.                                         |
| “Hello.” after an earlier greeting  | Respond naturally to the turn; skill loading does not request another opening speech.                                                      |

These are acceptance cases, not canned responses. Structural/offline tests verify resource loading and tool contracts. Evaluating model routing and conversational quality requires separately authorized model runs; no live call is part of skill validation.
