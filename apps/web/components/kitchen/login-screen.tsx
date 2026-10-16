'use client';

import Link from 'next/link';
import { ChefHat, LoaderCircle } from 'lucide-react';
import { LoginForm } from '@/components/login-form';

// Uses the official shadcn/ui login-04 block with Gordon AI's Google authentication.
export function LoginScreen({
  busy,
  error,
  onLogin,
}: {
  busy: boolean;
  error: string;
  onLogin: () => void;
}) {
  return (
    <main className="k-login">
      <header className="k-login-header">
        <Link href="/" className="k-login-wordmark" aria-label="Gordon AI home">
          <ChefHat size={31} strokeWidth={1.7} aria-hidden />
          Gordon <span>AI</span>
        </Link>
        <span className="k-login-header-note">Your live sous-chef</span>
      </header>
      <div className="k-login-layout">
        <LoginForm busy={busy} error={error} onLogin={onLogin} />
      </div>
    </main>
  );
}

export function SessionLoading() {
  return (
    <main className="k-session-loading" aria-label="Loading Gordon AI">
      <LoaderCircle size={21} className="k-login-spinner" aria-hidden />
      <span role="status">Loading…</span>
    </main>
  );
}
