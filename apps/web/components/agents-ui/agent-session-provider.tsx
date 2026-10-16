import {
  RoomAudioRenderer,
  SessionProvider,
  type UseSessionReturn,
} from '@livekit/components-react';

export function AgentSessionProvider({
  session,
  children,
}: {
  session: UseSessionReturn;
  children: React.ReactNode;
}) {
  return (
    <SessionProvider session={session}>
      {children}
      <RoomAudioRenderer />
    </SessionProvider>
  );
}
