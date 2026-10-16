'use client';

import { useMemo } from 'react';
import { TokenSource } from 'livekit-client';
import { useSession } from '@livekit/components-react';
import { AgentSessionProvider } from '@/components/agents-ui/agent-session-provider';
import { StartAudioButton } from '@/components/agents-ui/start-audio-button';
import { AppSidebar } from '@/components/kitchen/app-sidebar';
import { AuthGate, useAuth } from '@/components/kitchen/auth-gate';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAgentErrors } from '@/hooks/useAgentErrors';

function AppSetup() {
  useAgentErrors();

  return null;
}

interface AppProps {
  tokenEndpoint: string;
  agentName?: string;
  children?: React.ReactNode;
}

function AuthenticatedKitchen({ tokenEndpoint, agentName, children }: AppProps) {
  const { authenticatedFetch } = useAuth();
  const tokenSource = useMemo(
    () =>
      TokenSource.custom(async () => {
        // This app's endpoint owns room identity and agent dispatch configuration.
        const response = await authenticatedFetch(tokenEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'Could not connect to Gordon AI.');
        return data;
      }),
    [authenticatedFetch, tokenEndpoint]
  );

  const session = useSession(tokenSource, agentName ? { agentName } : undefined);

  return (
    <AgentSessionProvider session={session}>
      <AppSetup />
      <TooltipProvider>
        <SidebarProvider defaultOpen={false} className="gordon-shell">
          <AppSidebar />
          <div className="gordon-route-content">
            <SidebarTrigger className="gordon-mobile-toggle" />
            {children}
          </div>
        </SidebarProvider>
      </TooltipProvider>
      <StartAudioButton label="Start Audio" />
    </AgentSessionProvider>
  );
}

export function AppShell(props: AppProps) {
  return (
    <>
      <AuthGate>
        <AuthenticatedKitchen {...props} />
      </AuthGate>
      <Toaster
        position="top-center"
        className="toaster group"
        style={
          {
            '--normal-bg': 'var(--popover)',
            '--normal-text': 'var(--popover-foreground)',
            '--normal-border': 'var(--border)',
          } as React.CSSProperties
        }
      />
    </>
  );
}
