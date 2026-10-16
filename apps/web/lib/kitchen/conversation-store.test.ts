import { beforeEach, expect, it, vi } from 'vitest';
import { readConversation, readConversationHistory, writeConversation } from './conversation-store';

const fixture = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>() }));
vi.mock('server-only', () => ({}));
vi.mock('./firebase-admin', () => ({
  firestore: () => {
    function ref(path: string): unknown {
      let maximum = Infinity;
      let cursor: [number, string] | undefined;
      return {
        path,
        collection: (name: string) => ref(`${path}/${name}`),
        doc: (name: string) => ref(`${path}/${name}`),
        orderBy() {
          return this;
        },
        limit(value: number) {
          maximum = value;
          return this;
        },
        startAfter(time: number, id: string) {
          cursor = [time, id];
          return this;
        },
        async get() {
          return {
            docs: [...fixture.docs]
              .filter(
                ([key]) => key.startsWith(path + '/') && !key.slice(path.length + 1).includes('/')
              )
              .map(([key, value]) => ({ id: key.split('/').at(-1)!, value }))
              .filter(
                ({ id, value }) =>
                  !cursor ||
                  Number(value.timestamp) < cursor[0] ||
                  (value.timestamp === cursor[0] && id < cursor[1])
              )
              .sort(
                (a, b) =>
                  Number(b.value.timestamp) - Number(a.value.timestamp) || (a.id < b.id ? 1 : -1)
              )
              .slice(0, maximum)
              .map(({ value }) => ({ data: () => value })),
          };
        },
      };
    }
    return {
      collection: (name: string) => ref(name),
      batch: () => {
        const writes: [string, Record<string, unknown>][] = [];
        return {
          set: (reference: { path: string }, value: Record<string, unknown>) =>
            writes.push([reference.path, value]),
          commit: async () => {
            for (const [key, value] of writes) fixture.docs.set(key, value);
          },
        };
      },
    };
  },
}));
beforeEach(() => fixture.docs.clear());
const owner = { uid: 'cook-one', development: false };
const message = (index: number) => ({
  id: `message-${index}`,
  role: 'user' as const,
  timestamp: index + 1,
  content: [{ type: 'text' as const, text: `Turn ${index}` }],
});
it('stores under the verified cook and paginates the complete archive without gaps', async () => {
  await writeConversation(owner, {
    messages: Array.from({ length: 105 }, (_, index) => message(index)),
    history: [],
  });
  expect(
    [...fixture.docs.keys()].every((key) =>
      key.startsWith('cooks/cook-one/conversations/main/messages/')
    )
  ).toBe(true);
  const first = await readConversation(owner);
  expect(first.messages).toHaveLength(100);
  expect(first.hasMore).toBe(true);
  const previous = await readConversation(owner, first.nextCursor!);
  expect(previous.messages).toHaveLength(5);
  expect(previous.hasMore).toBe(false);
  expect(new Set([...previous.messages, ...first.messages].map((item) => item.id)).size).toBe(105);
  expect((await readConversation({ uid: 'cook-two', development: false })).messages).toEqual([]);
});
it('upserts stable IDs and can restore model context from saved UI text before agent history exists', async () => {
  await writeConversation(owner, { messages: [message(0)], history: [] });
  await writeConversation(owner, {
    messages: [{ ...message(0), content: [{ type: 'text', text: 'Final transcript' }] }],
    history: [],
  });
  expect((await readConversation(owner)).messages).toHaveLength(1);
  expect((await readConversationHistory(owner))[0].text).toBe('Final transcript');
});
