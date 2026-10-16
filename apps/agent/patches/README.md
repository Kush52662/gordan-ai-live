# Gemini transcript timing

Local patches for `@livekit/agents@1.9.3` and
`@livekit/agents-plugin-google@1.9.3` (Apache-2.0).

Gemini can deliver input transcription after the response has begun. The provider
already records the generation's original `turnStartedAt`, but interim events omit
it, AgentActivity drops it from UserInputTranscribed, and RoomIO omits it from text
stream headers. Client arrival-time ordering cannot recover the actual turn order.

The patches carry that timestamp and provider input item ID through existing
`lk.transcription` streams as `gordon.turn_started_at` and `gordon.input_item_id`.
They update source, ESM and CJS; no second model or transcription transport is added.
Timing changes wait for the preceding segment's final flush, preventing one turn
from inheriting the next turn's metadata.

The web transcript adapter reads this metadata through LiveKit's public
`useTranscriptions` hook. It aligns the agent clock once with the browser clock,
orders by turn time and preserves stable user IDs across interim/final streams.
It leaves earlier greetings and interrupted assistant turns before later speech.
Existing frontend patches still handle delayed chunks within an already-open stream.

Offline regression tests exercise real ESM and CJS SDK output, final-flush timing,
late user delivery, typed chat, interruptions and stable bubble identity.

Remove or revise these patches when upstream publishes equivalent end-to-end timing.
Reference: https://docs.livekit.io/reference/agents-js/interfaces/agents.llm-1.InputTranscriptionCompleted.html

## Non-blocking tool speech scheduling

Empty `willContinue:true` progress responses now use `SILENT`, so starting a
non-blocking tool does not itself request a spoken turn. Final responses still
close the call with `willContinue:false` and support a scheduling callback receiving
the tool name and output. Gordon AI uses `SILENT` for successful preference-only `edit_recipe`
background saves, and `WHEN_IDLE` for results that need a conversational response,
including failures. Failed saves are never silently discarded. Tool execution stays
`NON_BLOCKING`; this change adds no system-prompt instructions.

Offline tests exercise the installed ESM and CommonJS adapters and the application
policy. Protocol references:
- https://ai.google.dev/gemini-api/docs/live-api/tools#asynchronous-function-calling
- https://googleapis.github.io/js-genai/release_docs/classes/types.FunctionResponse.html

## Tool completion boundaries

Gemini can send `generationComplete` and `turnComplete` after a tool call has
closed its generation. These boundary-only messages must not create a new
generation: the adapter would emit a synthetic speech interruption and cancel
pending tool results. A new generation now requires actual model content, input
transcription or a tool call. Real interruptions remain enabled. The same ESM/CJS
regression checks cover both boundaries and genuine new content.
