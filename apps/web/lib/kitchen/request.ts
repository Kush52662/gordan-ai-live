// Next's internal URL can use localhost while the browser used 127.0.0.1.
// Compare the browser origin to the actual Host header, not that internal URL.
export function isSameOrigin(request: Request) {
  try {
    const origin = new URL(request.headers.get('origin') ?? '');
    const url = new URL(request.url);
    // Cloud Run terminates TLS before forwarding HTTP to the container.
    // Only trust its protocol header when running in the managed environment.
    const forwardedProtocol = process.env.K_SERVICE
      ? request.headers.get('x-forwarded-proto')
      : null;
    const protocol =
      forwardedProtocol === 'https' || forwardedProtocol === 'http'
        ? `${forwardedProtocol}:`
        : url.protocol;
    return (
      origin.host === (request.headers.get('host') ?? url.host) && origin.protocol === protocol
    );
  } catch {
    return false;
  }
}
