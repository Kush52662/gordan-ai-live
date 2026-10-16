import { cookies } from 'next/headers';
import 'server-only';
import { verifyAgentCapability } from './capability';
import { developmentAccessEnabled } from './development-access';
import { adminAuth } from './firebase-admin';

export type Owner = { uid: string; development: boolean };
export class Unauthorized extends Error {}
export async function browserOwner(): Promise<Owner> {
  const cookie = (await cookies()).get('gordon-session')?.value;
  if (cookie) {
    try {
      const user = await adminAuth().verifySessionCookie(cookie, true);
      return { uid: user.uid, development: false };
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
      if (
        typeof code === 'string' &&
        [
          'auth/argument-error',
          'auth/invalid-session-cookie',
          'auth/session-cookie-expired',
          'auth/session-cookie-revoked',
          'auth/user-disabled',
          'auth/user-not-found',
        ].includes(code)
      )
        throw new Unauthorized('Sign in again to restore your kitchen.');
      // An unavailable auth service is not proof that a valid session expired.
      throw error;
    }
  }
  if (developmentAccessEnabled()) return { uid: 'development-cook', development: true };
  throw new Unauthorized('Sign in to open your kitchen.');
}
export async function requestOwner(request: Request): Promise<Owner> {
  if (request.headers.has('authorization')) {
    try {
      return await verifyAgentCapability(request);
    } catch {
      throw new Unauthorized('Agent access expired. Reconnect to Gordon AI.');
    }
  }
  return browserOwner();
}
