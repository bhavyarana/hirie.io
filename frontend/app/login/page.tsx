'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/lib/theme';
import { ThemeToggle } from '@/components/ThemeToggle';

const FEATURES = [
  { icon: '🤖', title: 'AI Resume Scoring', desc: 'Mistral-powered ATS scoring with dimension-wise rubrics, skill matching, and score differentiation.' },
  { icon: '📊', title: 'Role-Based Analytics', desc: 'Deep dashboards per role — admin, manager, TL, recruiter — tracking funnels, pass rates, and team output.' },
  { icon: '🏢', title: 'Multi-Team Hierarchy', desc: 'Full org structure: Admins → Managers → Team Leads → Recruiters, each with scoped access and data.' },
  { icon: '🎯', title: 'Custom Scoring Criteria', desc: 'Configure pass/review/fail thresholds and dimension weights per job. AI adapts its scoring model accordingly.' },
  { icon: '🔍', title: 'Talent Pool Search', desc: 'Search candidates across your entire database by skills, title, and experience. Build pipelines proactively.' },
  { icon: '⚡', title: 'Real-time Pipeline', desc: 'BullMQ-powered background processing with live status updates, batch uploads of up to 100 resumes.' },
];

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const queryClient = useQueryClient();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      queryClient.clear();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.session) throw new Error('Login failed — no session returned. Please try again.');
      toast.success('Welcome back!');
      window.location.href = '/dashboard';
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  // Theme-aware tokens
  const t = {
    pageBg:         isDark ? '#060b14'                            : '#f8fafc',
    leftPanelBg:    isDark
      ? 'linear-gradient(145deg, #060b14 0%, #0a0f1e 60%, #0d1526 100%)'
      : 'linear-gradient(145deg, #f8fafc 0%, #f1f5f9 60%, #e8eef8 100%)',
    rightPanelBg:   isDark ? '#0a0f1e'                           : '#ffffff',
    rightPanelBdr:  isDark ? 'rgba(30,45,74,0.5)'               : 'rgba(226,232,240,0.8)',
    textPrimary:    isDark ? '#e2e8f0'                           : '#0f172a',
    textSecondary:  isDark ? '#94a3b8'                           : '#475569',
    textMuted:      isDark ? '#64748b'                           : '#64748b',
    textFaint:      isDark ? '#475569'                           : '#94a3b8',
    featureCardBg:  isDark ? 'rgba(13,21,38,0.7)'               : 'rgba(255,255,255,0.9)',
    featureCardBdr: isDark ? 'rgba(30,45,74,0.6)'               : 'rgba(226,232,240,0.9)',
    inputBg:        isDark ? '#111827'                           : '#f8fafc',
    inputBdr:       isDark ? '#1e2d4a'                           : '#e2e8f0',
    badgeBg:        isDark ? 'rgba(99,102,241,0.1)'             : 'rgba(99,102,241,0.08)',
    badgeBdr:       isDark ? 'rgba(99,102,241,0.2)'             : 'rgba(99,102,241,0.25)',
    subTagBg:       isDark ? 'rgba(30,45,74,0.5)'               : 'rgba(226,232,240,0.6)',
    subTagClr:      isDark ? '#334155'                           : '#94a3b8',
    labelClr:       isDark ? '#64748b'                           : '#64748b',
    orb1:           isDark
      ? 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)'
      : 'radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 70%)',
    orb2:           isDark
      ? 'radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)'
      : 'radial-gradient(circle, rgba(139,92,246,0.04) 0%, transparent 70%)',
    dividerClr:     isDark ? 'rgba(30,45,74,0.5)'               : 'rgba(226,232,240,0.8)',
    formHint:       isDark ? '#334155'                           : '#94a3b8',
    welcomeClr:     isDark ? '#e2e8f0'                           : '#0f172a',
    subWelcomeClr:  isDark ? '#475569'                           : '#94a3b8',
  };

  return (
    <div style={{
      minHeight: '100vh', background: t.pageBg,
      display: 'flex', alignItems: 'stretch',
      fontFamily: '"Inter", system-ui, sans-serif',
      transition: 'background 0.3s',
    }}>
      {/* ── Left panel — marketing ─────────────────────────────── */}
      <div style={{
        flex: '1 1 55%', display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '3rem 4rem', position: 'relative', overflow: 'hidden',
        background: t.leftPanelBg,
        transition: 'background 0.3s',
      }}>
        {/* Background glow */}
        <div style={{ position: 'absolute', top: '-20%', left: '-10%', width: '600px', height: '600px', borderRadius: '50%', background: t.orb1, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-15%', right: '5%', width: '400px', height: '400px', borderRadius: '50%', background: t.orb2, pointerEvents: 'none' }} />

        {/* Logo */}
        <Link href="/" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.625rem', marginBottom: '3rem' }}>
          <img src="/logo.png" alt="Hirie.io" style={{ width: '36px', height: '36px', objectFit: 'contain' }} />
          <span style={{ fontSize: '1.375rem', fontWeight: 800, color: t.textPrimary, letterSpacing: '-0.01em' }}>
            Hirie<span style={{ color: '#6366f1' }}>.io</span>
          </span>
        </Link>

        {/* Headline */}
        <div style={{ marginBottom: '2.5rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0.875rem', borderRadius: '999px', background: t.badgeBg, border: `1px solid ${t.badgeBdr}`, marginBottom: '1.25rem' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#6366f1', animation: 'pulse 2s infinite' }} />
            <span style={{ color: '#a5b4fc', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>AI-Powered Hiring Intelligence</span>
          </div>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 800, color: t.textPrimary, lineHeight: 1.2, letterSpacing: '-0.02em', margin: 0, marginBottom: '1rem' }}>
            The smartest way<br />
            <span style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>to hire at scale.</span>
          </h1>
          <p style={{ color: t.textMuted, fontSize: '0.975rem', lineHeight: 1.7, maxWidth: '480px', margin: 0 }}>
            From AI resume scoring to team analytics — a complete hiring intelligence platform built for modern recruitment teams.
          </p>
        </div>

        {/* Feature grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', maxWidth: '560px' }}>
          {FEATURES.map((f) => (
            <div key={f.title} style={{
              background: t.featureCardBg,
              border: `1px solid ${t.featureCardBdr}`,
              borderRadius: '0.875rem', padding: '1rem 1.125rem',
              backdropFilter: 'blur(8px)',
              transition: 'border-color 0.2s, background 0.2s',
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(99,102,241,0.35)'; (e.currentTarget as HTMLDivElement).style.background = isDark ? 'rgba(99,102,241,0.05)' : 'rgba(99,102,241,0.04)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = t.featureCardBdr; (e.currentTarget as HTMLDivElement).style.background = t.featureCardBg; }}
            >
              <div style={{ fontSize: '1.25rem', marginBottom: '0.4rem' }}>{f.icon}</div>
              <p style={{ color: t.textPrimary, fontWeight: 600, fontSize: '0.8rem', marginBottom: '0.25rem' }}>{f.title}</p>
              <p style={{ color: t.textFaint, fontSize: '0.72rem', lineHeight: 1.5, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div style={{ marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: `1px solid ${t.dividerClr}` }}>
          <p style={{ color: t.formHint, fontSize: '0.72rem', margin: 0 }}>
            Trusted by hiring teams · Role-based access · Real-time AI processing
          </p>
        </div>
      </div>

      {/* ── Right panel — login form ────────────────────────────── */}
      <div style={{
        flex: '0 0 400px', display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '3rem 2.5rem',
        background: t.rightPanelBg,
        borderLeft: `1px solid ${t.rightPanelBdr}`,
        position: 'relative',
        transition: 'background 0.3s, border-color 0.3s',
      }}>
        {/* Theme toggle — top right corner of login panel */}
        <div style={{ position: 'absolute', top: '1.5rem', right: '1.5rem' }}>
          <ThemeToggle compact />
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ color: t.welcomeClr, fontWeight: 700, fontSize: '1.375rem', marginBottom: '0.35rem' }}>Welcome back</h2>
          <p style={{ color: t.subWelcomeClr, fontSize: '0.8rem' }}>Sign in to your workspace</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.125rem' }}>
          <div>
            <label style={{ display: 'block', color: t.labelClr, fontSize: '0.775rem', fontWeight: 500, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Email
            </label>
            <input
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="username"
              style={{
                width: '100%', padding: '0.75rem 1rem', boxSizing: 'border-box' as const,
                background: t.inputBg, border: `1px solid ${t.inputBdr}`,
                borderRadius: '0.5rem', color: t.textPrimary, fontSize: '0.875rem',
                outline: 'none', transition: 'border-color 0.2s',
              }}
              onFocus={e => (e.target.style.borderColor = '#6366f1')}
              onBlur={e => (e.target.style.borderColor = t.inputBdr)}
            />
          </div>

          <div>
            <label style={{ display: 'block', color: t.labelClr, fontSize: '0.775rem', fontWeight: 500, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="current-password"
                style={{
                  width: '100%', padding: '0.75rem 2.75rem 0.75rem 1rem', boxSizing: 'border-box' as const,
                  background: t.inputBg, border: `1px solid ${t.inputBdr}`,
                  borderRadius: '0.5rem', color: t.textPrimary, fontSize: '0.875rem',
                  outline: 'none', transition: 'border-color 0.2s',
                }}
                onFocus={e => (e.target.style.borderColor = '#6366f1')}
                onBlur={e => (e.target.style.borderColor = t.inputBdr)}
              />
              <button
                type="button"
                onClick={() => setShowPassword(p => !p)}
                style={{
                  position: 'absolute', right: '0.75rem', top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: t.textMuted, fontSize: '1rem', lineHeight: 1, padding: '0.25rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = t.textPrimary)}
                onMouseLeave={e => (e.currentTarget.style.color = t.textMuted)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  /* Eye-off SVG */
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  /* Eye SVG */
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '0.875rem',
              background: loading ? '#3730a3' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff', border: 'none', borderRadius: '0.625rem',
              fontSize: '0.9rem', fontWeight: 600, letterSpacing: '0.01em',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: loading ? 'none' : '0 0 28px rgba(99,102,241,0.3)',
              transition: 'all 0.2s',
              marginTop: '0.375rem',
            }}
          >
            {loading ? 'Signing in…' : 'Sign In →'}
          </button>
        </form>

        <p style={{ textAlign: 'center', color: t.formHint, fontSize: '0.72rem', marginTop: '2rem', lineHeight: 1.6 }}>
          Contact your administrator to get access.<br />
          Your role and permissions are assigned by your org admin.
        </p>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @media (max-width: 768px) {
          div[style*="flex: 1 1 55%"] { display: none !important; }
          div[style*="flex: 0 0 400px"] { flex: 1 1 auto !important; }
        }
      `}</style>
    </div>
  );
}
