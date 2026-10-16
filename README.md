# Gordon AI

A voice-first cooking companion that helps a home cook turn available ingredients or a craving into a plated meal. Ask questions while your hands are busy; Gordon AI keeps the recipe, progress and timers alongside the conversation.

## What works

- Ingredient planning and availability checks by voice or touch, followed by a complete recipe after acceptance.
- Editable recipes, a saved recipe library and preparation, cooking and plating progress.
- One elapsed clock from cooking start through plating, plus independent named countdowns.
- A LiveKit/Gemini conversation with typed fallback, interruptions and saved context for reconnecting.
- Firebase Google sign-in, server session cookies and per-user Firestore storage adapters.

**Live app:** [Open Gordon AI](https://gordan.kushalmurthy.com). The frontend runs on Cloud Run and the voice agent runs on LiveKit Cloud.

**Verification:** 50 tests (36 web, 14 agent), type checks, lint, CI and production build pass. A production synthetic-audio rehearsal covered prep through plating, saved progress, the cooking clock, countdown expiry and reconnect. The earlier five text simulations passed 4/5. Google sign-in to the cooking workspace was manually verified on the public URL. A complete human browser/microphone cooking rehearsal remains outstanding. See [deployment details](DEPLOYMENT.md).

## Run locally

Requires Node 24, pnpm 10.28.1, a LiveKit Cloud project and a Gemini API key. Google sign-in also needs a Firebase project with Google authentication enabled and a Firestore database.

```sh
cp -n apps/web/.env.example apps/web/.env.local
cp -n apps/agent/.env.example apps/agent/.env.local
pnpm install:apps
pnpm dev:web
# In another terminal:
pnpm dev:agent
```

1. Fill in both environment files. Use matching LiveKit credentials and agent names; set the agent's `GORDON_API_URL=http://localhost:3000`.
2. Set the web app's public Firebase configuration, `FIREBASE_PROJECT_ID` and a random `KITCHEN_SIGNING_SECRET` of at least 32 characters. Set `FIRESTORE_DATABASE_ID` when using a named database.
3. Provide Firebase Admin application-default credentials locally, for example with `gcloud auth application-default login`. Authorize localhost in Firebase Authentication for local Google sign-in.
4. Open <http://localhost:3000>. Signing in does not activate the microphone. Choose **Talk to Gordon AI**, or **Type with Gordon AI** without microphone access.

For local cooking evaluation without Firebase, explicitly set `GORDON_ALLOW_DEV_AUTH=true` in the web environment file. This development-only mode uses a fixed test identity and local JSON storage; production rejects it. Environment files, credentials and local cooking data are excluded from Git.

## Architecture and tradeoffs

`apps/web` contains the Next.js interface, authentication, LiveKit token issuance and validated kitchen API. `apps/agent` contains one TypeScript LiveKit agent using `gemini-3.8-live`. The agent receives short-lived, user-scoped API access; the browser and voice agent use the same state transitions.

The agent exposes two application tools: `edit_recipe` edits and autosaves the current document; `update_cooking` records progress and manages real countdowns. `load_skill` reads bundled guidance. Ingredient drafts and complete methods share one recipe ID. Field edits preserve omitted fields; a supplied steps array replaces the full method. Server-sent events push committed revisions to the browser and agent, replacing periodic kitchen polling.

Recipes, a cooking brief, meal progress and timer deadlines persist independently of the model's conversation history. Assistant UI Agent Plan and Task Card elements show the recipe's actual actions and current human task (such as step 7 of 20). Voice and manual controls share progress, with manual changes silently synchronized to Gordon. Asynchronous tools keep speech input available during actions; compact context supports reconnection and context compression. Required SDK patches and their provenance are documented in each app's `patches` directory.

The first version supports one active meal per account. Recipes are AI-generated, without external recipe research or image lookup. There is no camera; coaching relies on the cook's description and appropriate doneness checks. Audible timer alerts require an active browser or connected voice agent. Recipe-link import and closed-browser notifications are deferred.

### Cooking skill

The agent uses one bundled [cook-with-gordon skill](apps/agent/skills/cook-with-gordon/SKILL.md), with referenced sub-procedures for the approved recipe and coaching flow. Its core body is active in persistent agent instructions; the relevant state-based sub-procedures are supplied alongside it, with other resources read through `load_skill` on demand within the same session. Startup does not inject a greeting request.

The separate [temporal guidance-plan schema](apps/agent/skills/cook-with-gordon/references/guidance-plan.schema.json) is an integration contract. Independent plan persistence and general scheduled check-ins are not implemented; existing recipe progress and named timers remain the durable source of execution state.

## Verification

```sh
pnpm test
pnpm check:web
pnpm check:agent
pnpm lint:web
pnpm lint:agent
pnpm build:web
```

Keep the combined web/agent unit suite at 50 tests maximum, focused on meaningful regressions. GitHub Actions runs these checks without cloud credentials. Optional `pnpm agent:eval` runs a local debugger smoke journey using LiveKit CLI 2.19.0+ and paid model usage against isolated in-memory cooking state; `pnpm agent:eval --audio` adds synthetic audio. Regenerate shared tool schemas after action-schema changes with `pnpm generate:tools`.

Before submission, rehearse one real journey from dish selection through plating, including a timer alert, interruption, refresh and reconnect. Verify logout and account isolation against the deployed services.

See [DESIGN.md](DESIGN.md) for the product experience and [DEPLOYMENT.md](DEPLOYMENT.md) for Cloud Run and LiveKit configuration.

Based on the official LiveKit [React](https://github.com/livekit-examples/agent-starter-react) and [Node](https://github.com/livekit-examples/agent-starter-node) starters; upstream MIT licenses are retained in each app.

### Saved conversation and resumption

Google-authenticated users retain one continuous conversation in Firestore under `cooks/{uid}/conversations/main`. Chat messages include their inline recipe cards; completed agent/user turns are also saved for model-context recovery. History restores after refresh with the microphone off. **Resume Gordon AI** starts voice with recent saved conversation context and the current kitchen state. Older chat messages are available through **Load earlier messages**. Saving failures are shown with retry; recipe and timer persistence stays independent.

The model receives at most 60 recent turns within a 40,000-character budget; the archive retains older messages. Gemini’s temporary session-resumption handles remain the SDK’s responsibility and do not replace Firestore history. Existing conversations from before this feature are not reconstructed from logs. Explicit development access uses `.gordon-data/development-conversation.json`; it never substitutes for an authenticated user’s Firestore history.
