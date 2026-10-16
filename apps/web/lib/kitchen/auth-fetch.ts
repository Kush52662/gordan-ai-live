export class SessionExpired extends Error {
  constructor() {
    super('Your session expired. Sign in again to restore your kitchen.');
  }
}

// Only a verified authentication failure locks the UI. Network errors and other
// HTTP failures remain recoverable without discarding the current session.
export function createAuthenticatedFetch(
  onUnauthorized: () => void,
  fetcher = fetch
): typeof fetch {
  return async (input, init) => {
    const response = await fetcher(input, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...init,
    });
    if (response.status === 401) {
      onUnauthorized();
      throw new SessionExpired();
    }
    return response;
  };
}
