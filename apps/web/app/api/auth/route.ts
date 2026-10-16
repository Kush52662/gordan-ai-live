import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/kitchen/firebase-admin';
import { Unauthorized, browserOwner } from '@/lib/kitchen/identity';
import { isSameOrigin } from '@/lib/kitchen/request';

export const runtime = 'nodejs';
export async function GET() {
  try {
    const owner = await browserOwner();
    return NextResponse.json(
      { signedIn: !owner.development, development: owner.development, uid: owner.uid },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    if (!(error instanceof Unauthorized))
      return NextResponse.json(
        { error: 'Sign-in verification is temporarily unavailable. Please retry.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } }
      );
    return NextResponse.json(
      { signedIn: false, development: false },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return NextResponse.json({ error: 'Invalid origin.' }, { status: 403 });
  try {
    const raw = await request.text();
    if (raw.length > 15000)
      return NextResponse.json({ error: 'Invalid sign-in request.' }, { status: 400 });
    const { idToken } = JSON.parse(raw) as { idToken?: string };
    if (!idToken || typeof idToken !== 'string')
      return NextResponse.json({ error: 'Sign-in token required.' }, { status: 400 });
    const user = await adminAuth().verifyIdToken(idToken, true);
    if (user.firebase.sign_in_provider !== 'google.com' || Date.now() / 1000 - user.auth_time > 300)
      return NextResponse.json({ error: 'Please sign in with Google again.' }, { status: 401 });
    const expiresIn = 5 * 24 * 60 * 60 * 1000;
    const value = await adminAuth().createSessionCookie(idToken, { expiresIn });
    (await cookies()).set('gordon-session', value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: expiresIn / 1000,
    });
    return NextResponse.json({ signedIn: true });
  } catch {
    return NextResponse.json(
      { error: 'Google sign-in could not be verified. Please retry.' },
      { status: 401 }
    );
  }
}
export async function DELETE(request: Request) {
  if (!isSameOrigin(request))
    return NextResponse.json({ error: 'Invalid origin.' }, { status: 403 });
  (await cookies()).delete('gordon-session');
  return NextResponse.json({ signedIn: false });
}
