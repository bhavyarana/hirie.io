'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';

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
  const queryClient = useQueryClient();

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

  return (
    <div style={{
      minHeight: '100vh', background: '#060b14',
      display: 'flex', alignItems: 'stretch',
      fontFamily: '"Inter", system-ui, sans-serif',
    }}>
      {/* ── Left panel — marketing ─────────────────────────────── */}
      <div style={{
        flex: '1 1 55%', display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '3rem 4rem', position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(145deg, #060b14 0%, #0a0f1e 60%, #0d1526 100%)',
      }}>
        {/* Background glow */}
        <div style={{ position: 'absolute', top: '-20%', left: '-10%', width: '600px', height: '600px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-15%', right: '5%', width: '400px', height: '400px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />

        {/* Logo */}
        <Link href="/" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.625rem', marginBottom: '3rem' }}>
          <span style={{ fontSize: '1.75rem' }}>🔮</span>
          <span style={{ fontSize: '1.375rem', fontWeight: 800, color: '#e2e8f0', letterSpacing: '-0.01em' }}>
            Resume<span style={{ color: '#6366f1' }}>Flow</span>
          </span>
        </Link>

        {/* Headline */}
        <div style={{ marginBottom: '2.5rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0.875rem', borderRadius: '999px', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', marginBottom: '1.25rem' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#6366f1', animation: 'pulse 2s infinite' }} />
            <span style={{ color: '#a5b4fc', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>AI-Powered Hiring Intelligence</span>
          </div>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 800, color: '#e2e8f0', lineHeight: 1.2, letterSpacing: '-0.02em', margin: 0, marginBottom: '1rem' }}>
            The smartest way<br />
            <span style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>to hire at scale.</span>
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.975rem', lineHeight: 1.7, maxWidth: '480px', margin: 0 }}>
            From AI resume scoring to team analytics — a complete hiring intelligence platform built for modern recruitment teams.
          </p>
        </div>

        {/* Feature grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', maxWidth: '560px' }}>
          {FEATURES.map((f) => (
            <div key={f.title} style={{
              background: 'rgba(13,21,38,0.7)', border: '1px solid rgba(30,45,74,0.6)',
              borderRadius: '0.875rem', padding: '1rem 1.125rem',
              backdropFilter: 'blur(8px)',
              transition: 'border-color 0.2s, background 0.2s',
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(99,102,241,0.35)'; (e.currentTarget as HTMLDivElement).style.background = 'rgba(99,102,241,0.05)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(30,45,74,0.6)'; (e.currentTarget as HTMLDivElement).style.background = 'rgba(13,21,38,0.7)'; }}
            >
              <div style={{ fontSize: '1.25rem', marginBottom: '0.4rem' }}>{f.icon}</div>
              <p style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '0.8rem', marginBottom: '0.25rem' }}>{f.title}</p>
              <p style={{ color: '#475569', fontSize: '0.72rem', lineHeight: 1.5, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div style={{ marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(30,45,74,0.5)' }}>
          <p style={{ color: '#334155', fontSize: '0.72rem', margin: 0 }}>
            Trusted by hiring teams · Role-based access · Real-time AI processing
          </p>
        </div>
      </div>

      {/* ── Right panel — login form ────────────────────────────── */}
      <div style={{
        flex: '0 0 400px', display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '3rem 2.5rem',
        background: '#0a0f1e',
        borderLeft: '1px solid rgba(30,45,74,0.5)',
      }}>
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '1.375rem', marginBottom: '0.35rem' }}>Welcome back</h2>
          <p style={{ color: '#475569', fontSize: '0.8rem' }}>Sign in to your workspace</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.125rem' }}>
          <div>
            <label style={{ display: 'block', color: '#64748b', fontSize: '0.775rem', fontWeight: 500, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
                background: '#111827', border: '1px solid #1e2d4a',
                borderRadius: '0.5rem', color: '#e2e8f0', fontSize: '0.875rem',
                outline: 'none', transition: 'border-color 0.2s',
              }}
              onFocus={e => (e.target.style.borderColor = '#6366f1')}
              onBlur={e => (e.target.style.borderColor = '#1e2d4a')}
            />
          </div>

          <div>
            <label style={{ display: 'block', color: '#64748b', fontSize: '0.775rem', fontWeight: 500, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="current-password"
              style={{
                width: '100%', padding: '0.75rem 1rem', boxSizing: 'border-box' as const,
                background: '#111827', border: '1px solid #1e2d4a',
                borderRadius: '0.5rem', color: '#e2e8f0', fontSize: '0.875rem',
                outline: 'none', transition: 'border-color 0.2s',
              }}
              onFocus={e => (e.target.style.borderColor = '#6366f1')}
              onBlur={e => (e.target.style.borderColor = '#1e2d4a')}
            />
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

        <p style={{ textAlign: 'center', color: '#334155', fontSize: '0.72rem', marginTop: '2rem', lineHeight: 1.6 }}>
          Contact your administrator to get access.<br />
          Your role and permissions are assigned by your org admin.
        </p>

        {/* Subtle version tag */}
        {/* <div style={{ position: 'absolute' as const, bottom: '1.5rem', right: '2rem' }}>
          <span style={{ color: '#1e2d4a', fontSize: '0.65rem' }}>v2.0 · AI Intelligence Platform</span>
        </div> */}
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
