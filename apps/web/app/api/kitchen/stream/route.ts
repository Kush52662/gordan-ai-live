import { agentContext } from '@/lib/kitchen/context';
import { requestOwner } from '@/lib/kitchen/identity';
import { readKitchen, watchKitchen } from '@/lib/kitchen/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  let owner;
  try {
    owner = await requestOwner(request);
  } catch {
    return Response.json({ error: 'Sign in to open your kitchen.' }, { status: 401 });
  }
  const agent = new URL(request.url).searchParams.get('view') === 'agent';
  const encoder = new TextEncoder();
  let close = () => {};
  const stream = new ReadableStream({
    async start(controller) {
      let ended = false,
        reading = false,
        dirty = false,
        revision = -1;
      let stop: undefined | (() => void);
      const heartbeat = setInterval(() => {
        if (!ended) controller.enqueue(encoder.encode(': keepalive\n\n'));
      }, 15000);
      const expiry = setTimeout(() => close(), 60000);
      close = () => {
        if (ended) return;
        ended = true;
        clearInterval(heartbeat);
        clearTimeout(expiry);
        stop?.();
        request.signal.removeEventListener('abort', close);
        controller.close();
      };
      request.signal.addEventListener('abort', close, { once: true });
      async function publish() {
        dirty = true;
        if (reading || ended) return;
        reading = true;
        try {
          while (dirty && !ended) {
            dirty = false;
            const state = await readKitchen(owner!);
            if (!ended && state.revision > revision) {
              revision = state.revision;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(agent ? agentContext(state) : state)}\n\n`)
              );
            }
          }
        } catch {
          close();
        } finally {
          reading = false;
        }
      }
      try {
        stop = await watchKitchen(
          owner!,
          () => void publish(),
          () => close()
        );
        if (ended) stop();
      } catch {
        close();
      }
    },
    cancel() {
      close();
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
