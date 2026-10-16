# Deployment

Deploy the Next.js UI and all APIs to one Cloud Run service. Deploy the TypeScript voice agent separately on LiveKit Cloud. Firebase Authentication supplies Google sign-in; Firestore stores each cook's kitchen.

## Live release

- Cloud Run URL: https://gordon-ai-720959878202.us-west1.run.app
- Custom URL: https://gordan.kushalmurthy.com (HTTPS verified with a valid Google-managed certificate).
- Cloud Run: `gordon-ai`, `us-west1`, revision `gordon-ai-00010-x7r` (100% traffic).
- Web image digest: `sha256:6a3e9f0cd41b849a4a1985cae6320d1f69aea9f90ce78d420e87d2bca1ee2fa5` (source commit `1ab5aa3`).
- LiveKit Cloud: agent `CA_6dKABqJacdvU`, production version `fm8JKww57pig` (Running), region `us-east`.
- Cloud dispatch name: `gordon-ai-cloud`, matching the web service's `AGENT_NAME`.
- Runtime identity has read/write access to the configured cooking database and the two Firebase permissions needed to read users and create session cookies.

Cloud Build `5eda6a2a-7727-442a-8091-f23afe68a7fc` succeeded; the web image was deployed by digest. Existing service identity, runtime configuration and agent secrets were preserved.

Verification: **50 unit tests pass** (36 web, 14 agent), both type checks and linters pass, and the bundled skill passes official validation. `/login`, `/icon.svg` and `/favicon.ico` return 200. Signed-out kitchen, conversation and change-stream APIs return 401. An authenticated agent stream returned 200 and its initial revision with zero test writes.

Five local LiveKit text simulations completed: **4 passed, 1 failed**. A simultaneous timer alert/status question produced an incomplete spoken answer; recovered acceptance/method-save retries also occurred.

The deployed agent was rehearsed with real synthetic speech over LiveKit RTC against authenticated APIs at the custom URL, using a separate test kitchen. The journey covered recipe planning, Prep → Cook → Plate → Finished, all five reported actions, an actual 10-second countdown and spoken expiry alert, timer cancellation, reconnect and a duration question. The original cooking timestamp survived reconnect; completion stopped elapsed time. Received agent audio contained nonzero samples. One duration question was interrupted by a subsequent spoken clause and answered when repeated clearly.

The browser restored an existing Google-authenticated session and sign-out returned to login. Fresh Google sign-in to the cooking workspace was subsequently confirmed manually by the user on the public URL. Two-account isolation and the complete authenticated browser/microphone journey remain unverified. The synthetic audio rehearsal does not substitute for a human cook using the UI.

A complete authenticated human cooking rehearsal remains outstanding. Independent temporal-guidance persistence and general scheduled check-ins remain unimplemented.

## Web configuration

Build `apps/web/Dockerfile` with `apps/web` as its context. Public Firebase configuration is compiled into the browser bundle and must be supplied as build arguments:

```text
NEXT_PUBLIC_FIREBASE_API_KEY=<Firebase web configuration>
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<Firebase auth domain>
NEXT_PUBLIC_FIREBASE_PROJECT_ID=<project ID>
NEXT_PUBLIC_FIREBASE_APP_ID=<Firebase web app ID>
```

Set these runtime variables on Cloud Run:

```text
FIREBASE_PROJECT_ID=<project ID>
FIRESTORE_DATABASE_ID=<database ID; omit for (default)>
LIVEKIT_URL=<LiveKit WebSocket URL>
LIVEKIT_API_KEY=<LiveKit API key>
LIVEKIT_API_SECRET=<LiveKit API secret>
AGENT_NAME=gordon-ai-cloud
KITCHEN_SIGNING_SECRET=<random secret of at least 32 characters>
```

The image listens on port 8080 with `NODE_ENV=production`. Public HTTP access allows visitors to reach sign-in; protected APIs independently verify the session. Do not enable `GORDON_ALLOW_DEV_AUTH` in production.

Use a dedicated Cloud Run service account with the Firebase Authentication and Firestore permissions needed by the Admin SDK. Configure server credentials as runtime variables; never put them in public build arguments or Git. Application-default credentials use the runtime service account, without a downloaded service-account key.

## Agent configuration

Build and deploy `apps/agent` through LiveKit Cloud using its Dockerfile. Configure its secrets separately:

```text
LIVEKIT_URL=<same project as the web service>
LIVEKIT_API_KEY=<LiveKit API key>
LIVEKIT_API_SECRET=<LiveKit API secret>
LIVEKIT_AGENT_NAME=gordon-ai-cloud
GOOGLE_API_KEY=<Gemini API key>
GEMINI_LIVE_MODEL=gemini-3.8-live
GORDON_API_URL=<Cloud Run HTTPS URL>
```

The dispatch name and LiveKit project must match the web service. `apps/agent/livekit.toml` identifies the deployed agent for subsequent CLI updates. Do not deploy `GORDON_DEBUG_KITCHEN_TOKEN`: the web API supplies short-lived user-scoped access with each dispatched session.

## Release sequence

1. Register a dedicated Firebase web app, enable Google sign-in and choose the Firestore database. Preserve existing applications and settings in a shared project.
2. Configure the Cloud Run service account and build the web image with public Firebase arguments. Both app Dockerfiles require their dependency patches during installation.
3. Deploy the web service and authorize its hostname in Firebase Authentication. Authorize localhost separately for local sign-in testing. For `gordan.kushalmurthy.com`, the Cloud Run domain mapping routes to `gordon-ai` and its Cloud DNS CNAME points to `ghs.googlehosted.com.`; wait for the managed certificate before using HTTPS. The custom hostname is also authorized in Firebase.
4. Deploy the LiveKit agent with the web service's HTTPS URL and matching dispatch configuration.
5. Verify Google login, logout, session expiry and two-account isolation. Signed-out users must not initialize voice or access protected APIs.
6. Rehearse dish selection through plating, named timer expiry, interruption, refresh and reconnect on the deployed URL.
7. Add the public URL and verified limitations to the README. Record the web revision and agent deployment ID for rollback.

The Firestore rules deny direct client access; the Admin SDK uses IAM and API ownership checks. Review the effect on existing applications before applying database-wide rules to a shared project.

Rebuild the web image when public Firebase configuration changes. Web revisions and LiveKit agent deployments update independently; keep persisted state compatible when rolling back.
