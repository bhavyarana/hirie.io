'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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

/* ─── Chevron SVG icon ─────────────────────────────────────── */
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round"
      style={{
        transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
        transform: open ? 'rotate(0deg)' : 'rotate(180deg)',
        display: 'block',
      }}
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

/* ─── Mobile hamburger bars ─────────────────────────────────── */
function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', width: '18px' }}>
      <span style={{
        display: 'block', height: '2px', background: 'var(--text-muted)', borderRadius: '2px',
        transition: 'transform 0.25s ease, opacity 0.25s ease',
        transform: open ? 'translateY(7px) rotate(45deg)' : 'none',
      }} />
      <span style={{
        display: 'block', height: '2px', background: 'var(--text-muted)', borderRadius: '2px',
        transition: 'opacity 0.25s ease',
        opacity: open ? 0 : 1,
      }} />
      <span style={{
        display: 'block', height: '2px', background: 'var(--text-muted)', borderRadius: '2px',
        transition: 'transform 0.25s ease, opacity 0.25s ease',
        transform: open ? 'translateY(-7px) rotate(-45deg)' : 'none',
      }} />
    </div>
  );
}

/* ─── Main Layout ───────────────────────────────────────────── */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { user, role, loading } = useUserContext();

  // Desktop: sidebar expanded vs. icon-only collapsed
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Mobile: drawer open/closed
  const [mobileOpen, setMobileOpen] = useState(false);
  // Track whether we're on a mobile viewport
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile on mount and on resize
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Close mobile drawer on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Auth redirect
  useEffect(() => {
    if (!loading && !user) window.location.href = '/login';
  }, [loading, user]);

  const navItems = ROLE_NAV[role] ?? [];

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    queryClient.clear();
    toast.success('Signed out');
    window.location.href = '/login';
  }

  if (loading || !user) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0f1e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#64748b', fontSize: '0.875rem' }}>Loading…</div>
      </div>
    );
  }

  // Desktop sidebar width
  const desktopSidebarW = sidebarOpen ? 240 : 64;
  // On mobile the sidebar is an overlay, doesn't affect main layout
  const mainMarginLeft = isMobile ? 0 : desktopSidebarW;

  /* ── Sidebar inner content (shared between desktop & mobile) ── */
  const sidebarContent = (isDrawer: boolean) => {
    const expanded = isDrawer ? true : sidebarOpen;
    return (
      <>
        {/* Logo row */}
        <div style={{ padding: '0 1.25rem', marginBottom: '2rem', overflow: 'hidden', whiteSpace: 'nowrap' }}>
          <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <img src="/logo.png" alt="Hirie.io" style={{ width: '28px', height: '28px', objectFit: 'contain', flexShrink: 0 }} />
            <span style={{
              fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)',
              opacity: expanded ? 1 : 0,
              transition: 'opacity 0.2s ease',
              whiteSpace: 'nowrap',
            }}>
              Hirie<span style={{ color: '#6366f1' }}>.io</span>
            </span>
          </Link>
        </div>

        {/* Nav links */}
        <nav style={{ flex: 1, padding: '0 0.75rem', overflow: 'hidden' }}>
          {navItems.map(item => {
            const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                title={!expanded ? item.label : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.625rem 0.75rem', borderRadius: '0.5rem', marginBottom: '0.25rem',
                  textDecoration: 'none', fontSize: '0.875rem', fontWeight: active ? 600 : 400,
                  color: active ? '#a5b4fc' : 'var(--text-muted)',
                  background: active ? 'var(--bg-active)' : 'transparent',
                  transition: 'all 0.15s',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                }}
                onMouseEnter={e => {
                  if (!active) (e.currentTarget as HTMLAnchorElement).style.background = 'var(--bg-hover)';
                }}
                onMouseLeave={e => {
                  if (!active) (e.currentTarget as HTMLAnchorElement).style.background = 'transparent';
                }}
              >
                <span style={{ flexShrink: 0, fontSize: '1.1rem', lineHeight: 1 }}>{item.icon}</span>
                <span style={{
                  opacity: expanded ? 1 : 0,
                  transition: 'opacity 0.15s ease',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                }}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div style={{
          padding: '0 0.75rem',
          borderTop: '1px solid var(--border)',
          paddingTop: '1rem', marginTop: '0.5rem',
          display: 'flex', flexDirection: 'column', gap: '0.5rem',
          overflow: 'hidden',
        }}>
          {/* User card */}
          {user && (
            <div style={{
              padding: '0.625rem 0.75rem', borderRadius: '0.5rem',
              background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)',
              marginBottom: '0.25rem',
              opacity: expanded ? 1 : 0,
              transition: 'opacity 0.15s ease',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
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
          <div style={{ padding: '0 0.25rem', overflow: 'hidden' }}>
            <div style={{ opacity: expanded ? 1 : 0, transition: 'opacity 0.15s ease', whiteSpace: 'nowrap' }}>
              <ThemeToggle />
            </div>
          </div>

          {/* Sign out */}
          <button
            onClick={handleSignOut}
            title={!expanded ? 'Sign Out' : undefined}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem',
              padding: '0.625rem 0.75rem', borderRadius: '0.5rem',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: '0.875rem', textAlign: 'left',
              transition: 'all 0.15s', whiteSpace: 'nowrap', overflow: 'hidden',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.08)'; (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; }}
          >
            <span style={{ flexShrink: 0 }}>🚪</span>
            <span style={{ opacity: expanded ? 1 : 0, transition: 'opacity 0.15s ease' }}>Sign Out</span>
          </button>
        </div>
      </>
    );
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-base)' }}>

      {/* ── Fixed notification bell — always top-right ─────────── */}
      <div style={{ position: 'fixed', top: '1rem', right: '1.25rem', zIndex: 60 }}>
        <NotificationBell />
      </div>

      {/* ── MOBILE: backdrop overlay ─────────────────────────── */}
      {isMobile && mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 45,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(2px)',
            animation: 'fadeIn 0.2s ease',
          }}
        />
      )}

      {/* ── MOBILE: drawer sidebar ───────────────────────────── */}
      {isMobile && (
        <aside style={{
          position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50,
          width: '240px',
          background: 'var(--bg-card)',
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', padding: '1.5rem 0',
          transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: mobileOpen ? '4px 0 30px rgba(0,0,0,0.3)' : 'none',
        }}>
          {sidebarContent(true)}
        </aside>
      )}

      {/* ── DESKTOP: fixed sidebar ───────────────────────────── */}
      {!isMobile && (
        <aside style={{
          width: `${desktopSidebarW}px`,
          flexShrink: 0,
          background: 'var(--bg-card)',
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          padding: '1.5rem 0',
          position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 40,
          transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          overflow: 'visible',   /* allow the arrow button to overflow */
        }}>
          {sidebarContent(false)}

          {/* ── Arrow collapse toggle — sits on the right edge ── */}
          <button
            onClick={() => setSidebarOpen(prev => !prev)}
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            style={{
              position: 'absolute',
              top: '50%',
              right: '-14px',
              transform: 'translateY(-50%)',
              width: '28px', height: '28px',
              borderRadius: '50%',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              transition: 'background 0.15s, color 0.15s, box-shadow 0.15s',
              zIndex: 50,
              padding: 0,
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = '#6366f1';
              (e.currentTarget as HTMLButtonElement).style.color = '#fff';
              (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 2px 12px rgba(99,102,241,0.4)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-card)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
              (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
            }}
          >
            <ChevronIcon open={sidebarOpen} />
          </button>
        </aside>
      )}

      {/* ── MOBILE: floating hamburger button ────────────────── */}
      {isMobile && (
        <button
          onClick={() => setMobileOpen(prev => !prev)}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          style={{
            position: 'fixed', top: '1rem', left: '1rem', zIndex: 55,
            width: '40px', height: '40px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '0.625rem', cursor: 'pointer',
            boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-card)')}
        >
          <HamburgerIcon open={mobileOpen} />
        </button>
      )}

      {/* ── Main content area ─────────────────────────────────── */}
      <main style={{
        marginLeft: `${mainMarginLeft}px`,
        flex: 1,
        minWidth: 0,
        overflowX: 'hidden',
        transition: 'margin-left 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        paddingTop: isMobile ? '4rem' : 0,
      }}>
        {children}
      </main>
    </div>
  );
}
