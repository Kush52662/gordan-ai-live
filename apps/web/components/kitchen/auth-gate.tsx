'use client';

import {
  Fragment,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
/* eslint-disable import/named -- Firebase's conditional re-exports are checked by TypeScript. */
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  inMemoryPersistence,
  setPersistence,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { createAuthenticatedFetch } from '@/lib/kitchen/auth-fetch';
import { LoginScreen, SessionLoading } from './login-screen';

type Identity = { uid: string; signedIn: boolean };
type SessionStatus = { signedIn: boolean; development: boolean; uid?: string };
type AuthContextValue = {
  signedIn: boolean;
  busy: boolean;
  signOut: () => Promise<void>;
  authenticatedFetch: typeof fetch;
};
const AuthContext = createContext<AuthContextValue | null>(null);
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('Kitchen access requires the authentication gate.');
  return context;
}

async function readSession(signal?: AbortSignal): Promise<SessionStatus> {
  const response = await fetch('/api/auth', {
    cache: 'no-store',
    credentials: 'same-origin',
    signal,
  });
  if (!response.ok) throw new Error('Could not check sign-in. Refresh to retry.');
  return response.json();
}
function sessionIdentity(data: SessionStatus): Identity | null {
  return (data.signedIn === true || data.development === true) &&
    typeof data.uid === 'string' &&
    data.uid
    ? { uid: data.uid, signedIn: data.signedIn === true }
    : null;
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === '/login';
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const expire = useCallback(
    (message = 'Your session expired. Sign in again to restore your kitchen.') => {
      generation.current++;
      setIdentity(null);
      setReady(true);
      setError(message);
    },
    []
  );
  const grant = useCallback((next: Identity) => {
    generation.current++;
    setIdentity(next);
    setReady(true);
    setError('');
  }, []);
  const authenticatedFetch = useMemo(() => {
    if (!identity) return fetch;
    const current = generation.current;
    return createAuthenticatedFetch(() => {
      // A late 401 from an old account must not invalidate a newer login.
      if (generation.current === current) expire();
    });
  }, [identity, expire]);
  useEffect(() => {
    const controller = new AbortController();
    const current = generation.current;
    readSession(controller.signal)
      .then((data) => {
        if (controller.signal.aborted || current !== generation.current) return;
        const next = sessionIdentity(data);
        if (next) grant(next);
        setReady(true);
      })
      .catch(() => {
        if (controller.signal.aborted || current !== generation.current) return;
        setError('Could not check sign-in. Refresh to retry.');
        setReady(true);
      });
    return () => controller.abort();
  }, [grant]);
  useEffect(() => {
    if (!identity) return;
    const controller = new AbortController();
    const current = generation.current;
    let checking = false;
    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        const next = sessionIdentity(await readSession(controller.signal));
        if (controller.signal.aborted || current !== generation.current) return;
        if (!next) expire();
        else if (next.uid !== identity.uid || next.signedIn !== identity.signedIn) grant(next);
      } catch {
        // Temporary network failures are not proof that the session expired.
      } finally {
        checking = false;
      }
    };
    const restore = () => void check();
    const poll = setInterval(restore, 60_000);
    window.addEventListener('focus', restore);
    return () => {
      controller.abort();
      clearInterval(poll);
      window.removeEventListener('focus', restore);
    };
  }, [identity, expire, grant]);
  async function login() {
    setBusy(true);
    setError('');
    const current = ++generation.current;
    try {
      const config = {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      };
      if (!config.apiKey || !config.authDomain || !config.projectId || !config.appId)
        throw new Error('Google sign-in is not configured yet.');
      const auth = getAuth(getApps().length ? getApp() : initializeApp(config));
      await setPersistence(auth, inMemoryPersistence);
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      try {
        const response = await fetch('/api/auth', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: await result.user.getIdToken() }),
        });
        if (!response.ok) throw new Error((await response.json()).error);
      } finally {
        await signOut(auth);
      }
      const next = sessionIdentity(await readSession());
      if (!next?.signedIn) throw new Error('Sign-in could not be restored. Please retry.');
      if (current === generation.current) grant(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  }
  const logout = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch('/api/auth', { method: 'DELETE' });
      if (!response.ok) throw new Error('Could not sign out. Please retry.');
      expire('');
    } finally {
      setBusy(false);
    }
  }, [expire]);
  useEffect(() => {
    if (!ready) return;
    if (identity && isLoginPage) {
      router.replace('/');
    } else if (!identity && !isLoginPage) {
      router.replace('/login');
    }
  }, [identity, ready, isLoginPage, router]);
  if (identity && !isLoginPage)
    return (
      <AuthContext.Provider
        value={{ signedIn: identity.signedIn, busy, signOut: logout, authenticatedFetch }}
      >
        <Fragment key={identity.uid}>{children}</Fragment>
      </AuthContext.Provider>
    );
  if (!ready || identity || !isLoginPage) return <SessionLoading />;
  return <LoginScreen busy={busy} error={error} onLogin={() => void login()} />;
}
