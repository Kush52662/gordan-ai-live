import { beforeEach, expect, it, vi } from 'vitest';
import { GET, POST } from '@/app/api/conversation/route';
import { Unauthorized } from './identity';

const mocks = vi.hoisted(() => ({
  owner: vi.fn(),
  read: vi.fn(),
  history: vi.fn(),
  write: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('./identity', () => ({
  requestOwner: mocks.owner,
  Unauthorized: class Unauthorized extends Error {},
}));
vi.mock('./conversation-store', () => ({
  readConversation: mocks.read,
  readConversationHistory: mocks.history,
  writeConversation: mocks.write,
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.owner.mockResolvedValue({ uid: 'cook-one', development: false });
  mocks.read.mockResolvedValue({
    ownerUid: 'cook-one',
    messages: [],
    hasMore: false,
    nextCursor: null,
  });
  mocks.history.mockResolvedValue([]);
});
const request = (ownerUid = 'cook-one', origin = 'https://gordon.example') =>
  new Request('https://gordon.example/api/conversation', {
    method: 'POST',
    headers: { origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ownerUid,
      messages: [
        { id: 'user-1', role: 'user', timestamp: 1000, content: [{ type: 'text', text: 'Hello' }] },
      ],
    }),
  });
it('scopes reads and writes to the authenticated cook', async () => {
  expect((await GET(new Request('https://gordon.example/api/conversation'))).status).toBe(200);
  expect(mocks.read).toHaveBeenCalledWith({ uid: 'cook-one', development: false }, undefined);
  expect((await POST(request())).status).toBe(200);
  expect(mocks.write.mock.calls[0][0].uid).toBe('cook-one');
});
it('rejects anonymous access, stale accounts and foreign origins', async () => {
  mocks.owner.mockRejectedValueOnce(new Unauthorized('Sign in.'));
  expect((await GET(new Request('https://gordon.example/api/conversation'))).status).toBe(401);
  expect((await POST(request('cook-two'))).status).toBe(403);
  expect((await POST(request('cook-one', 'https://other.example'))).status).toBe(403);
  expect(mocks.write).not.toHaveBeenCalled();
});
it('validates cursors and never falls back to another account', async () => {
  expect(
    (await GET(new Request('https://gordon.example/api/conversation?before=NaN&id=x'))).status
  ).toBe(400);
  expect(
    (await GET(new Request('https://gordon.example/api/conversation?before=1000&id=user-1'))).status
  ).toBe(200);
  expect(mocks.read).toHaveBeenCalledWith(
    { uid: 'cook-one', development: false },
    { timestamp: 1000, id: 'user-1' }
  );
});
