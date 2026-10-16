'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bookmark, ChefHat, LogOut, MessageCircle, UserRound } from 'lucide-react';
import { useSessionContext } from '@livekit/components-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { useAuth } from './auth-gate';

export function AppSidebar() {
  const pathname = usePathname();
  const auth = useAuth();
  const session = useSessionContext();
  const { setOpenMobile, isMobile } = useSidebar();
  const [error, setError] = useState('');
  const [accountOpen, setAccountOpen] = useState(false);
  async function signOut() {
    setError('');
    try {
      await session.end();
      await auth.signOut();
    } catch {
      setError('Could not sign out. Please retry.');
    }
  }
  return (
    <Sidebar collapsible="icon" className="gordon-sidebar" aria-label="Main navigation">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link href="/" />}
              aria-label="Gordon AI home"
              tooltip="Gordon AI"
              onClick={() => setOpenMobile(false)}
            >
              <ChefHat className="text-primary" />
              <span>Gordon AI</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarTrigger className="gordon-desktop-toggle" />
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {[
            { href: '/', label: 'Cook', Icon: MessageCircle },
            { href: '/recipes', label: 'My Recipes', Icon: Bookmark },
          ].map(({ href, label, Icon }) => (
            <SidebarMenuItem key={href}>
              <SidebarMenuButton
                render={<Link href={href} />}
                isActive={pathname === href}
                aria-current={pathname === href ? 'page' : undefined}
                aria-label={label}
                tooltip={label}
                onClick={() => setOpenMobile(false)}
              >
                <Icon />
                <span>{label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <Popover open={accountOpen} onOpenChange={setAccountOpen}>
              <PopoverTrigger
                render={<SidebarMenuButton aria-label="Your account" tooltip="Your account" />}
              >
                <UserRound />
                <span>Your account</span>
              </PopoverTrigger>

              <PopoverContent
                className="k-account-menu"
                side={isMobile ? 'top' : 'right'}
                align={isMobile ? 'start' : 'end'}
                sideOffset={12}
              >
                <button
                  className="k-text-button"
                  disabled={auth.busy}
                  onClick={() => void signOut()}
                >
                  <LogOut size={16} /> {auth.busy ? 'Signing out…' : 'Sign out'}
                </button>
                {error && <p role="alert">{error}</p>}
              </PopoverContent>
            </Popover>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
