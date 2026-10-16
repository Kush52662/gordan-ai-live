import { z } from 'zod';
import type { ThreadMessageLike } from '@assistant-ui/react';

const id = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9_.:-]+$/);
const text = z.object({ type: z.literal('text'), text: z.string().max(100000) });
const tool = z.object({
  type: z.literal('tool-call'),
  toolName: z.enum(['kitchen_recipe', 'kitchen_choices', 'kitchen_ingredients', 'kitchen_dishes']),
  toolCallId: id,
  args: z.record(z.string(), z.json()),
  argsText: z.string().max(300000),
  result: z.json().optional(),
});
export const savedMessageSchema = z
  .object({
    id,
    role: z.enum(['user', 'assistant']),
    timestamp: z.number().positive().finite(),
    content: z
      .array(z.discriminatedUnion('type', [text, tool]))
      .min(1)
      .max(30),
  })
  .refine(
    (message) => BufferByteLength(JSON.stringify(message)) <= 350000,
    'Message is too large to save.'
  );
// Works in both the browser and Node.
const BufferByteLength = (value: string) => new TextEncoder().encode(value).length;
export type SavedMessage = z.infer<typeof savedMessageSchema>;
export const historyMessageSchema = z.object({
  id,
  role: z.enum(['user', 'assistant']),
  timestamp: z.number().positive().finite(),
  text: z.string().min(1).max(100000),
  interrupted: z.boolean().default(false),
});
export type HistoryMessage = z.infer<typeof historyMessageSchema>;
export const conversationWriteSchema = z
  .object({
    ownerUid: z.string().min(1).max(200),
    messages: z.array(savedMessageSchema).max(20).default([]),
    history: z.array(historyMessageSchema).max(20).default([]),
  })
  .refine((value) => value.messages.length + value.history.length > 0, 'No messages to save.');

export function restoreMessages(saved: SavedMessage[]): ThreadMessageLike[] {
  return saved.map((message) => ({ ...message, createdAt: new Date(message.timestamp) }));
}
export function saveableMessages(
  messages: ThreadMessageLike[],
  times: Map<string, number>
): SavedMessage[] {
  return messages.map((message, index) => {
    const key = message.id!;
    let timestamp = message.createdAt?.getTime() ?? times.get(key);
    if (!timestamp) {
      const next = messages
        .slice(index + 1)
        .find((item) => item.createdAt)
        ?.createdAt?.getTime();
      timestamp = next ? next - (messages.length - index) / 1000 : Date.now();
      times.set(key, timestamp);
    }
    return savedMessageSchema.parse({ ...message, timestamp });
  });
}
export function mergeMessages(
  saved: ThreadMessageLike[],
  live: ThreadMessageLike[]
): ThreadMessageLike[] {
  const merged = new Map(saved.map((message) => [message.id, message]));
  for (const message of live) {
    const previous = merged.get(message.id);
    const previousParts = previous && Array.isArray(previous.content) ? previous.content : [];
    const liveParts = Array.isArray(message.content)
      ? message.content
      : [{ type: 'text' as const, text: message.content as string }];
    const callIds = new Set(
      liveParts.filter((part) => part.type === 'tool-call').map((part) => part.toolCallId)
    );
    const retained = previousParts.filter(
      (part) => part.type === 'tool-call' && !callIds.has(part.toolCallId)
    );
    merged.set(message.id, { ...message, content: [...liveParts, ...retained] });
  }
  return [...merged.values()].sort(
    (a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)
  );
}
export function recentHistory(history: HistoryMessage[], budget = 40000) {
  const selected: HistoryMessage[] = [];
  let length = 0;
  for (const item of [...history].sort((a, b) => a.timestamp - b.timestamp).reverse()) {
    if (selected.length >= 60 || length + item.text.length > budget) break;
    selected.unshift(item);
    length += item.text.length;
  }
  return selected;
}

// LiveKit clears its message store on disconnect. Keep a separate, cumulative
// view of observed turns, including unsaved turns while the network is offline.
export function retainMessages(previous: ThreadMessageLike[], incoming: ThreadMessageLike[]) {
  const merged = mergeMessages(previous, incoming);
  return JSON.stringify(previous) === JSON.stringify(merged) ? previous : merged;
}
