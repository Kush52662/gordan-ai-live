import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/token/route';
import { Unauthorized } from './identity';

const mocks = vi.hoisted(() => ({ owner: vi.fn(), capability: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('./identity', () => ({
  browserOwner: mocks.owner,
  Unauthorized: class Unauthorized extends Error {},
}));
vi.mock('./capability', () => ({ issueAgentCapability: mocks.capability }));

const request = () =>
  new Request('https://gordon.example/api/token', {
    method: 'POST',
    headers: { origin: 'https://gordon.example' },
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('LIVEKIT_API_KEY', '');
  vi.stubEnv('LIVEKIT_API_SECRET', '');
  vi.stubEnv('LIVEKIT_URL', '');
  vi.stubEnv('K_SERVICE', '');
});
afterEach(() => vi.unstubAllEnvs());
describe('token endpoint authentication', () => {
  it('rejects anonymous access even before LiveKit credentials are configured', async () => {
    mocks.owner.mockRejectedValueOnce(new Unauthorized('Sign in first.'));
    expect((await POST(request())).status).toBe(401);
    expect(mocks.capability).not.toHaveBeenCalled();
  });
  it('reports missing voice configuration only to authenticated users', async () => {
    mocks.owner.mockResolvedValueOnce({ uid: 'cook-one', development: false });
    expect((await POST(request())).status).toBe(503);
    expect(mocks.capability).not.toHaveBeenCalled();
  });
});
