'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { type Action, type Kitchen } from '@/lib/kitchen/model';
import { useAuth } from './auth-gate';

export function clock(ms: number) {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

export function useKitchen() {
  const { authenticatedFetch } = useAuth();
  const [kitchen, setKitchen] = useState<Kitchen | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [soundsEnabled, setSoundsEnabled] = useState(false);
  const [callSoundsEnabled, setCallSoundsEnabled] = useState(true);
  const pending = useRef(false);
  const audio = useRef<AudioContext | null>(null);
  const alerted = useRef(new Set<string>());
  const retry = useRef<{ commandId: string; revision: number; action: Action } | null>(null);

  const accept = useCallback((next: Kitchen) => {
    setKitchen((current) => (!current || next.revision > current.revision ? next : current));
  }, []);
  const refresh = useCallback(async () => {
    const response = await authenticatedFetch('/api/kitchen');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Could not load your kitchen.');
    accept(data);
  }, [accept, authenticatedFetch]);

  useEffect(() => {
    void refresh().catch((e: Error) => setError(e.message));
    const updates = new EventSource('/api/kitchen/stream');
    updates.onmessage = (event) => {
      try {
        accept(JSON.parse(event.data) as Kitchen);
      } catch {
        setError('Kitchen update could not be read.');
      }
    };
    updates.onerror = () => void refresh().catch((error: Error) => setError(error.message));
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const restore = () => {
      setNow(Date.now());
      void refresh().catch((e: Error) => setError(e.message));
    };
    window.addEventListener('focus', restore);
    return () => {
      updates.close();
      clearInterval(tick);
      window.removeEventListener('focus', restore);
    };
  }, [refresh, accept]);

  useEffect(() => {
    for (const timer of [...(kitchen?.timers ?? []), ...(kitchen?.meal?.timers ?? [])]) {
      if (timer.status !== 'running' || timer.deadline > now || alerted.current.has(timer.id))
        continue;
      if (audio.current?.state !== 'running') continue;
      alerted.current.add(timer.id);
      const oscillator = audio.current.createOscillator();
      const gain = audio.current.createGain();
      oscillator.connect(gain);
      gain.connect(audio.current.destination);
      gain.gain.value = 0.12;
      oscillator.frequency.value = 660;
      oscillator.start();
      oscillator.stop(audio.current.currentTime + 0.6);
    }
  }, [kitchen, now]);
  useEffect(
    () => () => {
      void audio.current?.close();
    },
    []
  );

  async function enableSounds() {
    try {
      audio.current ??= new AudioContext();
      await audio.current.resume();
      setSoundsEnabled(audio.current.state === 'running');
    } catch {
      setError('Timer sounds could not start. Visible alerts remain available.');
    }
  }

  async function playCallCue(cue: 'calling' | 'ready' | 'failed') {
    if (!callSoundsEnabled) return;
    try {
      audio.current ??= new AudioContext();
      await audio.current.resume();
      if (audio.current.state !== 'running') return;
      setSoundsEnabled(true);
      const context = audio.current;
      const notes = cue === 'calling' ? [440, 554] : cue === 'ready' ? [660, 880] : [330, 220];
      notes.forEach((frequency, index) => {
        const start = context.currentTime + index * 0.13;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.045, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.15);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
        oscillator.start(start);
        oscillator.stop(start + 0.16);
      });
    } catch {
      // Browser audio restrictions must never prevent a call.
    }
  }

  async function act(action: Action, repeat = false): Promise<Kitchen> {
    if (!kitchen) throw new Error('Your kitchen is still loading.');
    if (pending.current) throw new Error('Please wait for the current change to save.');
    pending.current = true;
    setBusy(true);
    setError('');
    const command =
      repeat && retry.current
        ? retry.current
        : { commandId: crypto.randomUUID(), revision: kitchen.revision, action };
    retry.current = command;
    try {
      const response = await authenticatedFetch('/api/kitchen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(command),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409) {
          retry.current = null;
          await refresh();
        }
        throw new Error(data.error ?? 'Your change could not be saved.');
      }
      accept(data);
      retry.current = null;
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Not saved. Please retry.');
      throw e;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function retrySave() {
    try {
      if (retry.current) await act(retry.current.action, true);
      else {
        await refresh();
        setError('');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not retry.');
    }
  }

  return {
    kitchen,
    error,
    setError,
    busy,
    now,
    act,
    retrySave,
    enableSounds,
    soundsEnabled,
    playCallCue,
    callSoundsEnabled,
    setCallSoundsEnabled,
  };
}

export type KitchenController = ReturnType<typeof useKitchen>;
