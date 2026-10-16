'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ThreadMessageLike } from '@assistant-ui/react';
import {
  type SavedMessage,
  mergeMessages,
  restoreMessages,
  retainMessages,
  saveableMessages,
} from '@/lib/kitchen/conversation';
import { useAuth } from './auth-gate';

type Page = {
  ownerUid: string;
  messages: SavedMessage[];
  hasMore: boolean;
  nextCursor: { timestamp: number; id: string } | null;
};
export function useConversation() {
  const { authenticatedFetch } = useAuth();
  const [messages, setMessages] = useState<ThreadMessageLike[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [cursor, setCursor] = useState<Page['nextCursor']>(null);
  const owner = useRef('');
  const acknowledgements = useRef(new Map<string, string>());
  const times = useRef(new Map<string, number>());
  const latest = useRef<ThreadMessageLike[]>([]);
  const pending = useRef<Promise<void>>(Promise.resolve());
  const mounted = useRef(true);
  const load = useCallback(
    async (older?: Page['nextCursor']) => {
      const query = older ? `?before=${older.timestamp}&id=${encodeURIComponent(older.id)}` : '';
      const response = await authenticatedFetch(`/api/conversation${query}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not restore chat.');
      if (!mounted.current) return;
      const page = data as Page;
      owner.current = page.ownerUid;
      for (const message of page.messages)
        acknowledgements.current.set(message.id, JSON.stringify(message));
      setMessages((previous) => mergeMessages(restoreMessages(page.messages), previous));
      setCursor(page.nextCursor);
      setReady(true);
      setError('');
    },
    [authenticatedFetch]
  );
  useEffect(() => {
    mounted.current = true;
    void load().catch(() => {
      if (mounted.current) setError('Chat history could not be restored. Retry before continuing.');
    });
    return () => {
      mounted.current = false;
    };
  }, [load]);
  const save = useCallback(() => {
    const work = pending.current.then(async () => {
      if (!owner.current) return;
      let snapshot: SavedMessage[];
      try {
        snapshot = saveableMessages(latest.current, times.current);
      } catch {
        if (mounted.current) setError('Some chat content could not be saved. Retry.');
        return;
      }
      const changed = snapshot.filter(
        (message) => acknowledgements.current.get(message.id) !== JSON.stringify(message)
      );
      if (!changed.length) return;
      if (mounted.current) setSaving(true);
      try {
        for (let index = 0; index < changed.length; index += 2) {
          const batch = changed.slice(index, index + 2);
          const response = await authenticatedFetch('/api/conversation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ownerUid: owner.current, messages: batch }),
          });
          if (!response.ok) throw new Error('Chat could not be saved.');
          for (const message of batch)
            acknowledgements.current.set(message.id, JSON.stringify(message));
        }
        if (mounted.current) setError('');
      } catch {
        if (mounted.current) setError('Chat has unsaved changes. Retrying when connected.');
      } finally {
        if (mounted.current) setSaving(false);
      }
    });
    pending.current = work.catch(() => {});
    return work;
  }, [authenticatedFetch]);
  const observe = useCallback((next: ThreadMessageLike[]) => {
    latest.current = retainMessages(latest.current, next);
    setMessages((previous) => retainMessages(previous, latest.current));
  }, []);
  useEffect(() => {
    if (!ready) return;
    const retry = setInterval(() => void save(), 2500);
    return () => clearInterval(retry);
  }, [ready, save]);
  const flush = useCallback(() => void save(), [save]);
  return {
    messages,
    ready,
    error,
    saving,
    observe,
    flush,
    hasMore: !!cursor,
    loadingOlder,
    retry: () => (ready ? save() : load().catch(() => {})),
    async loadOlder() {
      if (!cursor || loadingOlder) return;
      setLoadingOlder(true);
      try {
        await load(cursor);
      } catch {
        setError('Older messages could not be loaded. Retry.');
      } finally {
        setLoadingOlder(false);
      }
    },
  };
}
