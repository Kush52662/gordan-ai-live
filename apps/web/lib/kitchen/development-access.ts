export function developmentAccessEnabled() {
  return process.env.NODE_ENV === 'development' && process.env.GORDON_ALLOW_DEV_AUTH === 'true';
}
