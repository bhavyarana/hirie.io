'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { ThemeToggle } from '@/components/ThemeToggle';
import { NotificationBell } from '@/components/NotificationBell';
import { useUserContext } from '@/lib/context/UserContext';
import { useQueryClient } from '@tanstack/react-query';

const ROLE_NAV: Record<string, { href: string; icon: string; label: string }[]> = {
  admin: [
    { href: '/dashboard', icon: '🏠', label: 'Dashboard' },
    { href: '/dashboard/users', icon: '👤', label: 'Users' },
    { href: '/dashboard/teams', icon: '🏢', label: 'Teams' },
    { href: '/dashboard/jobs', icon: '💼', label: 'Jobs' },
    { href: '/dashboard/talent-pool', icon: '🔍', label: 'Talent Pool' },
    { href: '/dashboard/analytics', icon: '📊', label: 'Analytics' },
    { href: '/dashboard/settings', icon: '⚙️', label: 'Settings' },
  ],
  manager: [
    { href: '/dashboard', icon: '🏠', label: 'Dashboard' },
    { href: '/dashboard/teams', icon: '🏢', label: 'Teams' },
    { href: '/dashboard/jobs', icon: '💼', label: 'Jobs' },
    { href: '/dashboard/talent-pool', icon: '🔍', label: 'Talent Pool' },
    { href: '/dashboard/analytics', icon: '📊', label: 'Analytics' },
    { href: '/dashboard/settings', icon: '⚙️', label: 'Settings' },
  ],
  tl: [
    { href: '/dashboard', icon: '🏠', label: 'Dashboard' },
    { href: '/dashboard/my-teams', icon: '👥', label: 'My Teams' },
    { href: '/dashboard/jobs', icon: '💼', label: 'Jobs' },
    { href: '/dashboard/candidates', icon: '📋', label: 'My Candidates' },
    { href: '/dashboard/talent-pool', icon: '🔍', label: 'Talent Pool' },
    { href: '/dashboard/analytics', icon: '📊', label: 'Analytics' },
    { href: '/dashboard/settings', icon: '⚙️', label: 'Settings' },
  ],
  recruiter: [
    { href: '/dashboard', icon: '🏠', label: 'Dashboard' },
    { href: '/dashboard/jobs', icon: '💼', label: 'Assigned Jobs' },
    { href: '/dashboard/candidates', icon: '👥', label: 'My Candidates' },
    { href: '/dashboard/talent-pool', icon: '🔍', label: 'Talent Pool' },
    { href: '/dashboard/analytics', icon: '📊', label: 'Analytics' },
    { href: '/dashboard/settings', icon: '⚙️', label: 'Settings' },
  ],
};

const ROLE_COLORS: Record<string, string> = {
  admin: '#f59e0b',
  manager: '#6366f1',
  tl: '#22c55e',
  recruiter: '#38bdf8',
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manager',
  tl: 'Team Leader',
  recruiter: 'Recruiter',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, role, loading } = useUserContext();

  // Redirect to login if unauthenticated (after loading completes)
  useEffect(() => {
    if (!loading && !user) {
      window.location.href = '/login';
    }
  }, [loading, user]);

  const navItems = ROLE_NAV[role] ?? [];

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    // Clear ALL cached data so the next user doesn't see stale data
    queryClient.clear();
    toast.success('Signed out');
    // Hard redirect: fully reloads the app so no React state survives
    window.location.href = '/login';
  }

  // Show nothing while loading or unauthenticated (redirect happening)
  if (loading || !user) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0f1e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#64748b', fontSize: '0.875rem' }}>Loading…</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-base)' }}>
      {/* Sidebar */}
      <aside style={{
        width: '240px', flexShrink: 0,
        background: 'var(--bg-card)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', padding: '1.5rem 0',
        position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 40,
      }}>
        {/* Logo */}
        <div style={{ padding: '0 1.25rem', marginBottom: '2rem' }}>
          <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.25rem' }}>🔮</span>
            <span style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Resume<span style={{ color: '#6366f1' }}>Flow</span>
            </span>
          </Link>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '0 0.75rem' }}>
          {navItems.map(item => {
            const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.625rem 0.75rem', borderRadius: '0.5rem', marginBottom: '0.25rem',
                textDecoration: 'none', fontSize: '0.875rem', fontWeight: active ? 600 : 400,
                color: active ? '#a5b4fc' : 'var(--text-muted)',
                background: active ? 'var(--bg-active)' : 'transparent',
                transition: 'all 0.15s',
              }}>
                <span>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom: User info + Theme + Sign out */}
        <div style={{ padding: '0 0.75rem', borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {/* User info */}
          {!loading && user && (
            <div style={{
              padding: '0.625rem 0.75rem', borderRadius: '0.5rem',
              background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)',
              marginBottom: '0.25rem',
            }}>
              <p style={{ color: 'var(--text-primary)', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.name || user.email}
              </p>
              <span style={{
                fontSize: '0.65rem', fontWeight: 700, padding: '0.1rem 0.4rem',
                borderRadius: '999px', textTransform: 'uppercase', letterSpacing: '0.05em',
                background: `${ROLE_COLORS[role] || '#6366f1'}22`,
                color: ROLE_COLORS[role] || '#6366f1',
                border: `1px solid ${ROLE_COLORS[role] || '#6366f1'}40`,
              }}>
                {ROLE_LABELS[role] || role}
              </span>
            </div>
          )}

          {/* Theme toggle */}
          <div style={{ padding: '0 0.25rem' }}>
            <ThemeToggle />
          </div>

          <button onClick={handleSignOut} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem',
            padding: '0.625rem 0.75rem', borderRadius: '0.5rem',
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', fontSize: '0.875rem', textAlign: 'left',
            transition: 'all 0.15s',
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.08)'; (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; }}>
            <span>🚪</span> Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ marginLeft: '240px', flex: 1, overflowX: 'hidden' }}>
        {/* Top bar */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 30,
          background: 'rgba(var(--bg-base-rgb, 10,15,30), 0.85)', backdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border)',
          padding: '0.75rem 2rem',
          display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.75rem',
        }}>
          <NotificationBell />
        </div>
        {children}
      </main>
    </div>
  );
}
