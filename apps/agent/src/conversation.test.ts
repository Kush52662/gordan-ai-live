import { afterEach, expect, it, vi } from 'vitest';
import { createConversationClient } from './conversation.ts';

afterEach(() => vi.unstubAllGlobals());
it('restores genuine ChatContext and writes final messages idempotently without replaying tools', async () => {
  const writes: Record<string, unknown>[] = [];
  const fetcher = vi.fn(async (_url: unknown, options: RequestInit) => {
    expect(options.headers).toMatchObject({ Authorization: 'Bearer fixture' });
    if (options.method === 'POST') {
      writes.push(JSON.parse(options.body as string));
      return Response.json({ saved: true });
    }
    return Response.json({
      ownerUid: 'cook-one',
      history: [
        {
          id: 'user-1',
          role: 'user',
          timestamp: 1000,
          text: 'No peanuts please',
          interrupted: false,
        },
        {
          id: 'agent-1',
          role: 'assistant',
          timestamp: 2000,
          text: 'Understood.',
          interrupted: true,
        },
      ],
    });
  });
  vi.stubGlobal('fetch', fetcher);
  const client = createConversationClient('fixture');
  const restored = await client.load();
  expect(restored.resumed).toBe(true);
  expect(restored.chatCtx.items).toHaveLength(2);
  expect(restored.chatCtx.items[0]).toMatchObject({ role: 'user', createdAt: 1000 });
  const turn = {
    id: 'agent-2',
    role: 'assistant' as const,
    text: 'What would you like to cook?',
    timestamp: 3000,
    interrupted: false,
  };
  await client.save(turn);
  await client.drain();
  expect(writes[0]).toEqual({ ownerUid: 'cook-one', history: [turn] });
});
