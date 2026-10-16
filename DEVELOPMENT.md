# Development

## Run locally

Requires **Node 24**, **pnpm 10.28.1**, a LiveKit Cloud project and a Gemini API key. Google sign-in additionally requires Firebase Authentication, Firestore and local Firebase Admin credentials.

```sh
git clone https://github.com/Kush52662/gordan-ai-live.git
cd gordan-ai-live
cp -n apps/web/.env.example apps/web/.env.local
cp -n apps/agent/.env.example apps/agent/.env.local
```

**Configure before starting:** fill both environment files with matching LiveKit credentials and agent names. Set the agent’s `GORDON_API_URL=http://localhost:3000`. Give the web app a random `KITCHEN_SIGNING_SECRET` of at least 32 characters.

For Google sign-in, fill the Firebase fields, enable Google authentication, authorize `localhost`, and run `gcloud auth application-default login`. Set `FIRESTORE_DATABASE_ID` only for a named database.

For local evaluation without Firebase, set `GORDON_ALLOW_DEV_AUTH=true` in the web environment file. This uses a fixed development identity and local JSON storage; production rejects it. LiveKit and Gemini credentials are still required.

```sh
pnpm install:apps
pnpm dev:web
# In another terminal:
pnpm dev:agent
```

Open <http://localhost:3000>. Choose **Talk to Gordon AI** or **Type with Gordon AI**. The microphone stays off until explicitly activated. Never commit populated environment files.

## Verification and limits

Recorded release checks: 50 unit tests, both type checks and linters, and the production web build passed. Google sign-in was manually confirmed on the public URL. Production synthetic audio covered saved progress, cooking-clock continuity, countdown expiry and reconnect. Earlier text simulations passed 4/5; see [deployment evidence and remaining gaps](DEPLOYMENT.md).

```sh
pnpm test
pnpm check:web
pnpm check:agent
pnpm lint:web
pnpm lint:agent
pnpm build:web
```

Optional `pnpm agent:eval --audio` runs a local synthetic-audio smoke journey using LiveKit CLI 2.19.0+ and paid model usage. Run `pnpm generate:tools` after changing shared action schemas.

This version supports one active meal per account. Recipes are AI-generated without live web research. Coaching relies on the cook’s descriptions; there is no camera. Audible alerts require an active browser or connected agent. A complete human browser/microphone cooking rehearsal and two-account isolation verification remain outstanding.


For runtime architecture and deployment configuration, see [DEPLOYMENT.md](DEPLOYMENT.md).
