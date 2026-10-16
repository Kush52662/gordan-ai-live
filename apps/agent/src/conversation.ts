import { llm } from '@livekit/agents';

type Turn = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
  interrupted: boolean;
};
export function createConversationClient(token?: string) {
  const endpoint = new URL(
    '/api/conversation',
    process.env.GORDON_API_URL ?? 'http://localhost:3000',
  );
  if (endpoint.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(endpoint.hostname))
    throw new Error('Conversation storage requires HTTPS.');
  let ownerUid: string | undefined;
  let pending: Promise<void> = Promise.resolve();
  async function request(body?: unknown) {
    if (!token) throw new Error('Conversation access is unavailable.');
    const url = new URL(endpoint);
    url.searchParams.set('view', 'agent');
    const response = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(10000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Conversation storage failed.');
    return data;
  }
  return {
    async load() {
      const data = await request();
      ownerUid = data.ownerUid;
      const history = (data.history ?? []) as Turn[];
      const chatCtx = llm.ChatContext.empty();
      for (const turn of history)
        if ((turn.role === 'user' || turn.role === 'assistant') && typeof turn.text === 'string')
          chatCtx.addMessage({
            id: turn.id,
            role: turn.role,
            content: turn.text,
            createdAt: turn.timestamp,
            interrupted: !!turn.interrupted,
          });
      return { chatCtx, resumed: history.length > 0 };
    },
    save(turn: Turn) {
      const work = pending.then(async () => {
        if (!ownerUid) ownerUid = (await request()).ownerUid;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await request({ ownerUid, history: [turn] });
            return;
          } catch (error) {
            if (attempt === 2) throw error;
          }
        }
      });
      pending = work.catch(() => {});
      return work;
    },
    drain: () => pending,
  };
}
