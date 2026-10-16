'use client';

import type { ComponentProps } from 'react';
import { CheckIcon, CircleDotIcon } from 'lucide-react';
import { cn } from '@/lib/shadcn/utils';
import { announced, pct, progressOf } from '../utils/range';

// Adapted from https://github.com/assistant-ui/assistant-ui/blob/a46d6634e7a75eddd85d51415b1a615886d4ad0e/packages/ui/src/components/react/assistant-ui/elements/agent-plan.tsx
// MIT; see ../LICENSE. Standalone elements use the saved meal as their state.
const mono = 'font-mono text-[11px] tracking-tight';

export type AgentPlanStep = {
  id?: string | undefined;
  label: string;
  description?: string | undefined;
};

export function AgentPlan({
  steps,
  activeIndex,
  title = 'Plan',
  className,
  paused = false,
  ...props
}: Omit<ComponentProps<'div'>, 'children' | 'steps' | 'activeIndex'> & {
  steps: readonly (string | AgentPlanStep)[];
  activeIndex: number;
  paused?: boolean;
  title?: string | undefined;
}) {
  const total = steps.length;
  const completed = progressOf(activeIndex, total);
  const allDone = completed >= total;
  const progress = pct(completed, total);

  return (
    <div
      data-slot="agent-plan"
      className={cn('flex w-full max-w-sm flex-col gap-3', className)}
      {...props}
    >
      <div className="flex items-center justify-between">
        <span className="text-[13.5px] font-medium">{title}</span>
        <span className={cn(mono, 'text-muted-foreground tabular-nums')}>
          {completed} of {total}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${title} progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={announced(progress)}
        aria-valuetext={`${completed} of ${total} steps`}
        className="bg-foreground/[0.06] inset-ring-border h-[3px] w-full overflow-hidden rounded-full inset-ring forced-colors:outline"
      >
        <span
          aria-hidden
          className="bg-foreground/80 block h-full rounded-full transition-[width] duration-500 forced-color-adjust-none motion-reduce:transition-none"
          style={{ width: `${progress}%` }}
        />
      </div>
      <ul className="flex flex-col gap-2.5">
        {steps.map((step, i) => {
          const item = typeof step === 'string' ? { label: step } : step;
          const done = allDone || i < completed;
          const active = !paused && !allDone && i === completed;
          const status = done ? 'done' : active ? 'in progress' : 'not started';
          return (
            <li
              key={typeof step === 'string' ? i : (step.id ?? i)}
              aria-current={active ? 'step' : undefined}
              className={cn(
                'flex gap-2.5 text-[13.5px]',
                active && item.description ? 'items-start' : 'items-center'
              )}
            >
              <span className="flex size-4 shrink-0 items-center justify-center">
                {done ? (
                  <CheckIcon aria-hidden className="text-muted-foreground size-3.5" />
                ) : active ? (
                  <CircleDotIcon aria-hidden className="text-foreground/90 size-3.5" />
                ) : (
                  <span
                    aria-hidden
                    className="bg-foreground/15 inset-ring-border size-1.5 rounded-full inset-ring forced-colors:border"
                  />
                )}
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    done && 'text-muted-foreground',
                    active && 'text-foreground/90',
                    !done && !active && 'text-muted-foreground'
                  )}
                >
                  {item.label}
                </span>
                <span className="sr-only">{` ${status}`}</span>
                {active && item.description ? (
                  <span className="text-muted-foreground mt-0.5 block text-xs">
                    {item.description}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
