import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { issueAgentCapability } from './capability';
import { Unauthorized, browserOwner } from './identity';

const mocks = vi.hoisted(() => ({
  cookie: undefined as string | undefined,
  verify: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (mocks.cookie ? { value: mocks.cookie } : undefined) }),
}));
vi.mock('./firebase-admin', () => ({ adminAuth: () => ({ verifySessionCookie: mocks.verify }) }));

beforeEach(() => {
  mocks.cookie = undefined;
  mocks.verify.mockReset();
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('GORDON_ALLOW_DEV_AUTH', 'false');
  vi.stubEnv('KITCHEN_SIGNING_SECRET', 'test-signing-key-at-least-thirty-two-characters');
});
afterEach(() => vi.unstubAllEnvs());

describe('server authentication boundary', () => {
  it('rejects development access in production even when the flag is set', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('GORDON_ALLOW_DEV_AUTH', 'true');
    await expect(browserOwner()).rejects.toBeInstanceOf(Unauthorized);
    await expect(
      issueAgentCapability({ uid: 'development-cook', development: true })
    ).rejects.toThrow('disabled');
  });
  it('does not fall back to local access for an expired or revoked cookie', async () => {
    vi.stubEnv('GORDON_ALLOW_DEV_AUTH', 'true');
    mocks.cookie = 'expired';
    mocks.verify.mockRejectedValue(
      Object.assign(new Error('revoked'), { code: 'auth/session-cookie-revoked' })
    );
    await expect(browserOwner()).rejects.toBeInstanceOf(Unauthorized);
  });
  it('derives ownership from a verified session with revocation checks', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mocks.cookie = 'valid';
    mocks.verify.mockResolvedValue({ uid: 'cook-one' });
    await expect(browserOwner()).resolves.toEqual({ uid: 'cook-one', development: false });
    expect(mocks.verify).toHaveBeenCalledWith('valid', true);
  });
});
