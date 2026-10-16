'use client';

import Image from 'next/image';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field, FieldGroup } from '@/components/ui/field';

export function LoginForm({
  busy,
  error,
  onLogin,
}: {
  busy: boolean;
  error: string;
  onLogin: () => void;
}) {
  return (
    <Card className="k-login-card overflow-hidden p-0">
      <CardContent className="k-login-card-grid grid p-0 md:grid-cols-2">
        <section className="k-login-form-panel" aria-label="Sign in to Gordon AI">
          <FieldGroup className="k-login-fields">
            <div className="k-login-intro">
              <p className="k-login-eyebrow">A seat at your kitchen counter</p>
              <h1>Let’s get cooking.</h1>
              <p className="k-login-description">
                Find something you’ll love to cook. Gordon AI helps you make it, from the first
                ingredient to the final touch.
              </p>
            </div>
            <Field>
              <Button
                variant="outline"
                type="button"
                className="k-login-continue h-14 w-full"
                disabled={busy}
                onClick={onLogin}
              >
                {busy ? (
                  <LoaderCircle className="k-login-spinner" aria-hidden />
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22Z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M6.41 13.92A6 6 0 0 1 6.1 12c0-.67.11-1.32.31-1.92V7.49H3.07A10 10 0 0 0 2 12c0 1.61.39 3.14 1.07 4.51l3.34-2.59Z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.96c1.47 0 2.79.51 3.83 1.51l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.93 5.49l3.34 2.59C7.2 7.72 9.4 5.96 12 5.96Z"
                    />
                  </svg>
                )}
                {busy ? 'Signing in…' : 'Continue with Google'}
                {!busy && <ArrowRight size={18} className="k-login-continue-arrow" aria-hidden />}
              </Button>
            </Field>
            {error && (
              <p className="text-destructive text-center text-sm" role="alert">
                {error}
              </p>
            )}
            <div className="k-login-stages" aria-label="Discover, prepare, cook and plate">
              <span>Discover</span>
              <span>Prep</span>
              <span>Cook</span>
              <span>Plate</span>
            </div>
          </FieldGroup>
        </section>
        <div className="k-login-art">
          <Image
            src="/images/gordon-ai-login.png"
            alt=""
            fill
            sizes="(min-width: 768px) 560px, 1px"
            className="object-cover object-top"
            priority
          />
          <div className="k-login-art-copy">
            <p>
              Good cooking starts with <span>good company.</span>
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
