import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE, POST } from '@/app/api/auth/route';

const mocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  createSessionCookie: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
  owner: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ set: mocks.set, delete: mocks.delete }),
}));
vi.mock('./firebase-admin', () => ({ adminAuth: () => mocks }));
vi.mock('./identity', () => ({
  browserOwner: mocks.owner,
  Unauthorized: class Unauthorized extends Error {},
}));

function login(token = 'test-id-token', origin = 'https://gordon.example.run.app') {
  return new Request('https://gordon.example.run.app/api/auth', {
    method: 'POST',
    headers: { origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: token }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('K_SERVICE', '');
  mocks.verifyIdToken.mockResolvedValue({
    uid: 'cook-one',
    firebase: { sign_in_provider: 'google.com' },
    auth_time: Date.now() / 1000,
  });
  mocks.createSessionCookie.mockResolvedValue('signed-session');
});
afterEach(() => vi.unstubAllEnvs());

describe('Google server session routes', () => {
  it('exchanges a recent Google token for a five-day secure HttpOnly session', async () => {
    expect((await POST(login())).status).toBe(200);
    expect(mocks.verifyIdToken).toHaveBeenCalledWith('test-id-token', true);
    expect(mocks.createSessionCookie).toHaveBeenCalledWith('test-id-token', {
      expiresIn: 432000000,
    });
    expect(mocks.set).toHaveBeenCalledWith('gordon-session', 'signed-session', {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 432000,
    });
  });
  it('rejects cross-origin login before verifying or creating a session', async () => {
    expect((await POST(login('token', 'https://foreign.example'))).status).toBe(403);
    expect(mocks.verifyIdToken).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it('rejects invalid tokens, stale logins and other sign-in providers', async () => {
    mocks.verifyIdToken.mockRejectedValueOnce(new Error('invalid'));
    expect((await POST(login())).status).toBe(401);
    mocks.verifyIdToken.mockResolvedValueOnce({
      auth_time: Date.now() / 1000 - 301,
      firebase: { sign_in_provider: 'google.com' },
    });
    expect((await POST(login())).status).toBe(401);
    mocks.verifyIdToken.mockResolvedValueOnce({
      auth_time: Date.now() / 1000,
      firebase: { sign_in_provider: 'password' },
    });
    expect((await POST(login())).status).toBe(401);
    expect(mocks.createSessionCookie).not.toHaveBeenCalled();
  });

  it('clears the cookie only for same-origin logout', async () => {
    expect((await DELETE(login('token', 'https://foreign.example'))).status).toBe(403);
    expect(mocks.delete).not.toHaveBeenCalled();
    expect((await DELETE(login())).status).toBe(200);
    expect(mocks.delete).toHaveBeenCalledWith('gordon-session');
  });
});
