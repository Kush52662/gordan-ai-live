'use client';

import Image from 'next/image';
import { ArrowUpRight, LoaderCircle } from 'lucide-react';
import './kitchen-starter.css';

export function KitchenStarter({
  disabled,
  connecting,
  onIngredients,
  onCraving,
  onVoice,
}: {
  disabled: boolean;
  connecting: boolean;
  onIngredients: () => void;
  onCraving: () => void;
  onVoice: () => void;
}) {
  return (
    <div className="k-kitchen-starter">
      <h1>What are we cooking?</h1>
      <p>Start with your ingredients, a craving, or a conversation.</p>
      <div className="k-start-objects">
        <button className="k-start-object" disabled={disabled} onClick={onIngredients}>
          <Image src="/images/starter/basket.webp" alt="" width={320} height={240} priority />
          <strong>
            Use my ingredients <ArrowUpRight size={16} aria-hidden />
          </strong>
        </button>
        <button className="k-start-object" disabled={disabled} onClick={onCraving}>
          <Image src="/images/starter/dish.webp" alt="" width={320} height={240} priority />
          <strong>
            I have a dish in mind <ArrowUpRight size={16} aria-hidden />
          </strong>
        </button>
      </div>
      <button className="k-start-voice" disabled={disabled} onClick={onVoice}>
        <Image src="/images/starter/mic.webp" alt="" width={64} height={76} priority />
        <strong>{connecting ? 'Connecting…' : 'Talk to Gordon'}</strong>
        {connecting ? (
          <LoaderCircle size={16} className="animate-spin" aria-hidden />
        ) : (
          <ArrowUpRight size={16} aria-hidden />
        )}
      </button>
    </div>
  );
}
