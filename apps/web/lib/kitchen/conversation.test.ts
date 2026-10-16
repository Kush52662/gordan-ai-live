import { describe, expect, it } from 'vitest';
import {
  mergeMessages,
  restoreMessages,
  retainMessages,
  saveableMessages,
  savedMessageSchema,
} from './conversation';

const text = (id: string, role: 'user' | 'assistant', timestamp: number, value = id) => ({
  id,
  role,
  timestamp,
  content: [{ type: 'text' as const, text: value }],
});
describe('durable conversation rendering', () => {
  it('retains new turns after disconnect clears LiveKit, and accepts later revisions once', () => {
    const live = restoreMessages([text('u', 'user', 1000), text('a', 'assistant', 2000)]);
    const retained = retainMessages([], live);
    expect(retainMessages(retained, [])).toBe(retained);
    const updated = retainMessages(
      retained,
      restoreMessages([text('a', 'assistant', 2000, 'Final reply')])
    );
    expect(updated).toHaveLength(2);
    expect(updated[1].content).toEqual([{ type: 'text', text: 'Final reply' }]);
    expect(retainMessages(updated, updated)).toBe(updated);
    expect(saveableMessages(retainMessages(updated, []), new Map())).toHaveLength(2);
  });
  it('restores original chronology and preserves inline recipe cards', () => {
    const saved = [
      text('user', 'user', 1000),
      {
        ...text('reply', 'assistant', 2000),
        content: [
          {
            type: 'tool-call' as const,
            toolName: 'kitchen_recipe' as const,
            toolCallId: 'recipe-1',
            args: { target: 'recipe-1' },
            argsText: '{"target":"recipe-1"}',
            result: { ready: true },
          },
        ],
      },
    ];
    const restored = restoreMessages(saved);
    expect(saveableMessages(restored, new Map())).toEqual(saved);
    expect(restored[1].content).toEqual(saved[1].content);
  });
  it('updates an existing transcript without duplicating it or losing its card', () => {
    const saved = restoreMessages([
      {
        ...text('reply', 'assistant', 2000, 'Hello'),
        content: [
          { type: 'text' as const, text: 'Hello' },
          {
            type: 'tool-call' as const,
            toolName: 'kitchen_recipe' as const,
            toolCallId: 'recipe-1',
            args: {},
            argsText: '{}',
          },
        ],
      },
    ]);
    const live = restoreMessages([
      text('reply', 'assistant', 2000, 'Hello again'),
      text('next', 'user', 3000),
    ]);
    const merged = mergeMessages(saved, live);
    expect(merged.map((message) => message.id)).toEqual(['reply', 'next']);
    expect(merged[0].content).toHaveLength(2);
    expect(merged[0].content[0]).toMatchObject({ text: 'Hello again' });
  });
  it('rejects unknown executable tools and invalid document IDs', () => {
    expect(savedMessageSchema.safeParse({ ...text('../other', 'user', 1000) }).success).toBe(false);
    expect(
      savedMessageSchema.safeParse({
        ...text('id', 'assistant', 1000),
        content: [
          {
            type: 'tool-call',
            toolName: 'execute_shell',
            toolCallId: 'x',
            args: {},
            argsText: '{}',
          },
        ],
      }).success
    ).toBe(false);
  });
});
