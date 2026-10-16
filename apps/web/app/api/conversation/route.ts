import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { conversationWriteSchema } from '@/lib/kitchen/conversation';
import {
  readConversation,
  readConversationHistory,
  writeConversation,
} from '@/lib/kitchen/conversation-store';
import { Unauthorized, requestOwner } from '@/lib/kitchen/identity';
import { isSameOrigin } from '@/lib/kitchen/request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function failure(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof Unauthorized
          ? error.message
          : error instanceof ZodError
            ? 'Invalid conversation data.'
            : 'Conversation could not be saved or restored. Retry when connected.',
    },
    { status: error instanceof Unauthorized ? 401 : error instanceof ZodError ? 400 : 503 }
  );
}
export async function GET(request: Request) {
  try {
    const owner = await requestOwner(request);
    const params = new URL(request.url).searchParams;
    if (params.get('view') === 'agent')
      return NextResponse.json(
        { ownerUid: owner.uid, history: await readConversationHistory(owner) },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    let cursor;
    if (params.has('before')) {
      const timestamp = Number(params.get('before'));
      const id = params.get('id');
      if (
        !Number.isFinite(timestamp) ||
        timestamp <= 0 ||
        !id ||
        !/^[A-Za-z0-9_.:-]{1,200}$/.test(id)
      )
        return NextResponse.json({ error: 'Invalid history cursor.' }, { status: 400 });
      cursor = { timestamp, id };
    }
    return NextResponse.json(await readConversation(owner, cursor), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  if (!request.headers.has('authorization') && !isSameOrigin(request))
    return NextResponse.json({ error: 'Invalid origin.' }, { status: 403 });
  try {
    const owner = await requestOwner(request);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 1000000)
      return NextResponse.json({ error: 'Conversation batch too large.' }, { status: 413 });
    const data = conversationWriteSchema.parse(JSON.parse(raw));
    if (data.ownerUid !== owner.uid)
      return NextResponse.json(
        { error: 'The signed-in account changed. Reload before saving.' },
        { status: 403 }
      );
    await writeConversation(owner, data);
    return NextResponse.json({ saved: true });
  } catch (error) {
    return failure(error);
  }
}
