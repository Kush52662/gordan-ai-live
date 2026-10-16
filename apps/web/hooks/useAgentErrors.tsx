import { useEffect } from 'react';
import { toast } from 'sonner';
import { useAgent, useSessionContext } from '@livekit/components-react';

export function useAgentErrors() {
  const agent = useAgent();
  const { isConnected, end } = useSessionContext();
  useEffect(() => {
    if (isConnected && agent.state === 'failed') {
      toast.error('Gordon AI disconnected. Your saved meal is safe; reconnect to continue.');
      void end();
    }
  }, [agent.state, isConnected, end]);
}
