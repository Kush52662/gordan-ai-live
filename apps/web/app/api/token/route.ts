import { NextResponse } from 'next/server';
import { AccessToken, RoomAgentDispatch, RoomConfiguration } from 'livekit-server-sdk';
import { issueAgentCapability } from '@/lib/kitchen/capability';
import { Unauthorized, browserOwner } from '@/lib/kitchen/identity';
import { isSameOrigin } from '@/lib/kitchen/request';

export const revalidate = 0;
export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return NextResponse.json({ error: 'Invalid origin.' }, { status: 403 });
  try {
    const owner = await browserOwner();
    const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL } = process.env;
    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL)
      return NextResponse.json({ error: 'Voice connection is not configured.' }, { status: 503 });
    const roomName = `gordon_${crypto.randomUUID()}`;
    const participantToken = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: `cook_${crypto.randomUUID()}`,
      name: 'Cook',
      ttl: '15m',
    });
    participantToken.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canPublishData: true,
      canSubscribe: true,
    });
    participantToken.roomConfig = new RoomConfiguration({
      agents: [
        new RoomAgentDispatch({
          agentName: process.env.AGENT_NAME ?? 'gordon-on-call',
          metadata: JSON.stringify({ kitchenToken: await issueAgentCapability(owner) }),
        }),
      ],
    });
    return NextResponse.json(
      {
        serverUrl: LIVEKIT_URL,
        roomName,
        participantName: 'Cook',
        participantToken: await participantToken.toJwt(),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    if (error instanceof Unauthorized)
      return NextResponse.json({ error: error.message }, { status: 401 });
    return NextResponse.json(
      { error: 'Could not connect to Gordon AI. Please retry.' },
      { status: 503 }
    );
  }
}
