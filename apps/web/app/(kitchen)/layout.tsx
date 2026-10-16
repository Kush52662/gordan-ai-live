import { AppShell } from '@/components/app/app';

export default function KitchenLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell tokenEndpoint="/api/token" agentName={process.env.AGENT_NAME ?? 'gordon-on-call'}>
      {children}
    </AppShell>
  );
}
