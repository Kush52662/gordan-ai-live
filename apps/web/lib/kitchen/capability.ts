import { SignJWT, jwtVerify } from 'jose';
import 'server-only';
import { developmentAccessEnabled } from './development-access';
import type { Owner } from './identity';

function key() {
  const secret = process.env.KITCHEN_SIGNING_SECRET;
  if (!secret || secret.length < 32) throw new Error('Kitchen signing secret is not configured.');
  return new TextEncoder().encode(secret);
}
export async function issueAgentCapability(owner: Owner) {
  if (owner.development && !developmentAccessEnabled())
    throw new Error('Development access is disabled.');
  return new SignJWT({ scope: 'own-kitchen', development: owner.development })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(owner.uid)
    .setAudience('gordon-kitchen')
    .setIssuer('gordon-web')
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(key());
}
export async function verifyAgentCapability(request: Request): Promise<Owner> {
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) throw new Error('Agent credential missing.');
  const { payload } = await jwtVerify(token, key(), {
    algorithms: ['HS256'],
    audience: 'gordon-kitchen',
    issuer: 'gordon-web',
  });
  if (!payload.sub || payload.scope !== 'own-kitchen' || typeof payload.development !== 'boolean')
    throw new Error('Invalid agent access.');
  if (payload.development && (!developmentAccessEnabled() || payload.sub !== 'development-cook'))
    throw new Error('Development access is disabled.');
  return { uid: payload.sub, development: payload.development };
}
