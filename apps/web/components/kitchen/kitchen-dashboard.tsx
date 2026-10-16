'use client';

import { useEffect, useRef, useState } from 'react';
import { Music2, Timer } from 'lucide-react';
import { currentStep } from '@/lib/kitchen/model';
import { CookingStepper } from './cooking-stepper';
import { type KitchenController, clock } from './use-kitchen';

export function KitchenDashboard({
  controller,
  onOpenMeal,
}: {
  controller: KitchenController;
  onOpenMeal: () => void;
}) {
  const { kitchen, now, busy, act, soundsEnabled, enableSounds } = controller;
  const meal = kitchen?.meal;
  const noCook = !!meal && !meal.recipe.steps.some((action) => action.stage === 'cook');
  const step = meal && !meal.needsReconciliation ? currentStep(meal) : undefined;
  const timers = [...(kitchen?.timers ?? []), ...(meal?.timers ?? [])];
  const [timerLabel, setTimerLabel] = useState('');
  const [minutes, setMinutes] = useState(5);
  const [track, setTrack] = useState<{ name: string; url: string } | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  useEffect(
    () => () => {
      if (track) URL.revokeObjectURL(track.url);
    },
    [track]
  );
  const run = (action: Parameters<typeof act>[0]) => void act(action).catch(() => {});
  return (
    <div className="k-dashboard">
      {meal && (
        <>
          <button className="k-text-button" onClick={onOpenMeal}>
            {meal.recipe.title} · Open recipe
          </button>
          <CookingStepper controller={controller} />
        </>
      )}
      <section
        className="k-widget k-elapsed-widget"
        aria-label="Cooking timer"
        data-running={meal?.startedAt != null && !meal.finishedAt}
      >
        <h2>
          <Timer size={16} /> Cooking elapsed
        </h2>
        <p className="k-clock">
          {meal?.startedAt != null
            ? clock((meal.finishedAt ?? now) - meal.startedAt)
            : noCook
              ? '—'
              : '00:00'}
        </p>
        <p className="k-muted">
          {noCook
            ? 'No cooking stage for this recipe.'
            : meal?.startedAt == null
              ? 'Starts when you begin cooking.'
              : meal.finishedAt
                ? 'Meal completed'
                : 'Since cooking started'}
        </p>
      </section>
      {!meal && (
        <section className="k-widget" aria-label="Recipe progress">
          <p className="k-muted">
            Your recipe’s actual steps appear here once you begin preparation.
          </p>
        </section>
      )}
      <section className="k-widget" aria-label="Countdown timers">
        <h2>
          <Timer size={16} /> Countdown timers
        </h2>
        {timers.length === 0 && (
          <p className="k-muted">Keep an eye on sauce, rice or resting time.</p>
        )}
        {timers.map((timer) => (
          <div
            className={`k-timer-row ${timer.status === 'running' && timer.deadline <= now ? 'is-due' : ''}`}
            key={timer.id}
          >
            <div>
              <span>{timer.label}</span>
              <small>
                {timer.status === 'running'
                  ? timer.deadline <= now
                    ? 'Time’s up — check your food'
                    : clock(timer.deadline - now)
                  : timer.status}
              </small>
            </div>
            {timer.status === 'running' && (
              <button
                className="k-text-button"
                disabled={busy}
                onClick={() =>
                  run({
                    type: timer.deadline <= now ? 'acknowledge_timer' : 'cancel_timer',
                    timerId: timer.id,
                  })
                }
              >
                {timer.deadline <= now ? 'Acknowledge' : 'Cancel'}
              </button>
            )}
          </div>
        ))}
        <form
          className="k-timer-form"
          onSubmit={(event) => {
            event.preventDefault();
            void act({
              type: 'create_timer',
              label: timerLabel,
              seconds: Math.round(minutes * 60),
              ...(step ? { stepId: step.id } : {}),
            })
              .then(() => setTimerLabel(''))
              .catch(() => {});
          }}
        >
          <label>
            Timer name
            <input
              required
              maxLength={80}
              placeholder="Sauce, rice, resting…"
              value={timerLabel}
              onChange={(e) => setTimerLabel(e.target.value)}
            />
          </label>
          <label>
            Minutes
            <input
              type="number"
              required
              min="0.0167"
              max="1440"
              step="any"
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            />
          </label>
          <button className="k-button k-button-small" disabled={busy || !kitchen}>
            Add timer
          </button>
        </form>
        <button className="k-text-button" onClick={() => void enableSounds()}>
          {soundsEnabled ? 'Timer sounds enabled' : 'Enable timer sounds'}
        </button>
        <p className="k-muted">Keep this tab active for timely audible alerts.</p>
      </section>
      <section className="k-widget" aria-label="Music player">
        <h2>
          <Music2 size={16} /> Kitchen music
        </h2>
        <p className="k-muted">
          Choose a track from your device. It stays local. Pause it while speaking with Gordon AI.
        </p>
        <label className="k-music-file">
          Choose audio
          <input
            type="file"
            accept="audio/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              audio.current?.pause();
              setTrack({ name: file.name, url: URL.createObjectURL(file) });
            }}
          />
        </label>
        {track && (
          <>
            <p className="k-track-name">{track.name}</p>
            <audio
              ref={audio}
              key={track.url}
              src={track.url}
              controls
              preload="none"
              aria-label="Kitchen music playback"
            />
          </>
        )}
      </section>
    </div>
  );
}
