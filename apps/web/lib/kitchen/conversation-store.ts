import { FieldPath } from 'firebase-admin/firestore';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import 'server-only';
import { type HistoryMessage, type SavedMessage, recentHistory } from './conversation';
import { firestore } from './firebase-admin';
import type { Owner } from './identity';
import { assertLocalDevelopment } from './store';

type Cursor = { timestamp: number; id: string };
type Archive = { messages: SavedMessage[]; history: HistoryMessage[] };
const file = path.join(process.cwd(), '.gordon-data', 'development-conversation.json');
let pending: Promise<unknown> = Promise.resolve();
const root = (owner: Owner) =>
  firestore().collection('cooks').doc(owner.uid).collection('conversations').doc('main');
async function local(): Promise<Archive> {
  assertLocalDevelopment();
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { messages: [], history: [] };
    throw error;
  }
}
export async function readConversation(owner: Owner, cursor?: Cursor) {
  let messages: SavedMessage[];
  if (owner.development) {
    const archive = await local();
    messages = archive.messages
      .filter(
        (message) =>
          !cursor ||
          message.timestamp < cursor.timestamp ||
          (message.timestamp === cursor.timestamp && message.id < cursor.id)
      )
      .sort((a, b) => b.timestamp - a.timestamp || (a.id < b.id ? 1 : a.id === b.id ? 0 : -1))
      .slice(0, 101);
  } else {
    let query = root(owner)
      .collection('messages')
      .orderBy('timestamp', 'desc')
      .orderBy(FieldPath.documentId(), 'desc')
      .limit(101);
    if (cursor) query = query.startAfter(cursor.timestamp, cursor.id);
    messages = (await query.get()).docs.map((doc) => doc.data() as SavedMessage);
  }
  const hasMore = messages.length > 100;
  messages = messages.slice(0, 100).reverse();
  return {
    ownerUid: owner.uid,
    messages,
    hasMore,
    nextCursor: hasMore ? { timestamp: messages[0].timestamp, id: messages[0].id } : null,
  };
}
export async function readConversationHistory(owner: Owner) {
  const history = owner.development
    ? (await local()).history
    : (
        await root(owner).collection('history').orderBy('timestamp', 'desc').limit(60).get()
      ).docs.map((doc) => doc.data() as HistoryMessage);
  if (!history.length) {
    const page = await readConversation(owner);
    return recentHistory(
      page.messages
        .map((message) => ({
          id: message.id,
          role: message.role,
          timestamp: message.timestamp,
          interrupted: false,
          text: message.content
            .filter((part) => part.type === 'text')
            .map((part) => part.text)
            .join('\n'),
        }))
        .filter((message) => message.text)
    );
  }
  return recentHistory(history);
}
export async function writeConversation(owner: Owner, data: Archive) {
  if (!owner.development) {
    const batch = firestore().batch();
    for (const message of data.messages)
      batch.set(root(owner).collection('messages').doc(message.id), message);
    for (const message of data.history)
      batch.set(root(owner).collection('history').doc(message.id), message);
    await batch.commit();
    return;
  }
  assertLocalDevelopment();
  const work = pending.then(async () => {
    const before = await local();
    const merge = <T extends { id: string }>(old: T[], updates: T[]) => [
      ...new Map([...old, ...updates].map((item) => [item.id, item])).values(),
    ];
    const archive = {
      messages: merge(before.messages, data.messages),
      history: merge(before.history, data.history),
    };
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    const temp = `${file}.${crypto.randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(archive), { mode: 0o600 });
    await rename(temp, file);
  });
  pending = work.catch(() => undefined);
  await work;
}
