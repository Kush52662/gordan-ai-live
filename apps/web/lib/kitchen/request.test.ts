import { afterEach, describe, expect, it, vi } from 'vitest';
import { isSameOrigin } from './request';

afterEach(() => vi.unstubAllEnvs());
function request(origin: string, forwarded = 'https') {
  return new Request('http://localhost:8080/api/auth', {
    headers: { host: 'gordon.example.run.app', origin, 'x-forwarded-proto': forwarded },
  });
}
describe('same-origin requests through Cloud Run', () => {
  it('accepts the external HTTPS origin after TLS terminates at the managed proxy', () => {
    vi.stubEnv('K_SERVICE', 'gordon-ai');
    expect(isSameOrigin(request('https://gordon.example.run.app'))).toBe(true);
  });
  it('rejects foreign origins even when forwarded HTTPS is trusted', () => {
    vi.stubEnv('K_SERVICE', 'gordon-ai');
    expect(isSameOrigin(request('https://foreign.example'))).toBe(false);
    expect(isSameOrigin(request('http://gordon.example.run.app'))).toBe(false);
    expect(isSameOrigin(request('null'))).toBe(false);
  });
});
