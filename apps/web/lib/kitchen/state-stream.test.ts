import { afterEach, expect, it, vi } from 'vitest';
import { GET } from '../../app/api/kitchen/stream/route';
import { emptyKitchen } from './model';

const mocks = vi.hoisted(() => ({ owner: vi.fn(), read: vi.fn(), watch: vi.fn() }));
vi.mock('./identity', () => ({ requestOwner: mocks.owner }));
vi.mock('./store', () => ({ readKitchen: mocks.read, watchKitchen: mocks.watch }));

afterEach(() => vi.resetAllMocks());
it('refuses unauthenticated streams before subscribing', async () => {
  mocks.owner.mockRejectedValue(new Error('Unauthorized'));
  const result = await GET(new Request('https://example.com/api/kitchen/stream'));
  expect(result.status).toBe(401);
  expect(mocks.watch).not.toHaveBeenCalled();
});
it('pushes consistent revisions, skips duplicates and releases the owner listener on disconnect', async () => {
  const abort = new AbortController();
  const stop = vi.fn();
  let changed!: () => void;
  mocks.owner.mockResolvedValue({ uid: 'cook', development: false });
  const state = emptyKitchen();
  mocks.read.mockImplementation(async () => structuredClone(state));
  mocks.watch.mockImplementation(async (_owner, notify) => {
    changed = notify;
    queueMicrotask(notify);
    return stop;
  });
  const response = await GET(
    new Request('https://example.com/api/kitchen/stream', { signal: abort.signal })
  );
  expect(response.headers.get('content-type')).toBe('text/event-stream');
  const reader = response.body!.getReader(),
    decoder = new TextDecoder();
  expect(decoder.decode((await reader.read()).value)).toContain('"revision":0');
  changed();
  await vi.waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(2));
  state.revision = 1;
  changed();
  expect(decoder.decode((await reader.read()).value)).toContain('"revision":1');
  abort.abort();
  expect((await reader.read()).done).toBe(true);
  expect(stop).toHaveBeenCalledTimes(1);
});
