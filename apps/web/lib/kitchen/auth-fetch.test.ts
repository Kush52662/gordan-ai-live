import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionExpired, createAuthenticatedFetch } from './auth-fetch';

afterEach(() => vi.restoreAllMocks());
describe('authenticated browser requests', () => {
  it('locks the application on a 401 from either protected endpoint', async () => {
    const expired = vi.fn();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 401 }));
    const request = createAuthenticatedFetch(expired, fetcher);
    await expect(request('/api/token', { method: 'POST' })).rejects.toBeInstanceOf(SessionExpired);
    await expect(request('/api/kitchen')).rejects.toBeInstanceOf(SessionExpired);
    expect(expired).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenCalledWith('/api/kitchen', {
      credentials: 'same-origin',
      cache: 'no-store',
    });
  });
});
