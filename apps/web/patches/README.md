# LiveKit transcript ordering

These dependency patches vendor the pending LiveKit fix for delayed transcript
ordering, rather than maintaining an application transcript store.

- Issue: https://github.com/livekit/components-js/issues/1280
- Upstream PR: https://github.com/livekit/components-js/pull/1346 (not yet merged)
- Source commit: `9ee393210d4217521836144dfae11084511203c4`
- Packages: `@livekit/components-core@0.12.15`, `@livekit/components-react@2.9.24`

The source changes and core regression tests are copied from that commit. The
corresponding functions in the distributed ESM/CommonJS bundles are transpiled
from those sources; core declarations include the upstream `firstReceivedTime`
field. Existing bundle symbol names are retained. LiveKit is Apache-2.0 licensed.

Streams are ordered by their first local open time, before text arrives. Interim
and final streams retain that time for their shared segment. The assistant-ui
adapter uses LiveKit's segment ID so transcript updates reuse the same bubble.

Remove both patches after upgrading to a release containing this fix.

For Gemini transcripts that are opened only after the reply starts, stream-open
ordering alone is insufficient. Gordon AI also carries original turn timing through
agent SDK patches in `apps/agent/patches`; the web adapter uses that metadata through
LiveKit's public transcription hook. See that directory for the end-to-end fix.
