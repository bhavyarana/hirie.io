'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';

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

      // Sign out any existing session first to ensure a clean slate
      await supabase.auth.signOut();

      // Clear ALL cached query data from any previous session
      queryClient.clear();

      // Sign in with the entered credentials
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) throw error;

      if (!data.session) {
        throw new Error('Login failed — no session returned. Please try again.');
      }

      toast.success('Welcome back!');
      // Hard navigate to flush all server-side state
      window.location.href = '/dashboard';
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.75rem 1rem',
    background: '#1e2d4a', border: '1px solid #2d3f5f',
    borderRadius: '0.5rem', color: '#e2e8f0', fontSize: '0.875rem',
    outline: 'none', transition: 'border-color 0.2s',
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#0a0f1e',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1.5rem',
      backgroundImage: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(99,102,241,0.12) 0%, transparent 70%)',
    }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <span style={{ fontSize: '2rem' }}>🔮</span>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#e2e8f0', marginTop: '0.5rem' }}>
              Resume<span style={{ color: '#6366f1' }}>Flow</span>
            </div>
          </Link>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '0.5rem' }}>
            AI-Powered Candidate Screening
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: '#0d1526', border: '1px solid #1e2d4a',
          borderRadius: '1rem', padding: '2rem', boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
        }}>
          <h2 style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '1.25rem', marginBottom: '0.25rem' }}>
            Sign In
          </h2>
          <p style={{ color: '#64748b', fontSize: '0.8rem', marginBottom: '1.75rem' }}>
            Enter your credentials to access the dashboard.
          </p>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.875rem', marginBottom: '0.375rem' }}>
                Email Address
              </label>
              <input
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="username"
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = '#6366f1')}
                onBlur={e => (e.target.style.borderColor = '#2d3f5f')}
              />
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.875rem', marginBottom: '0.375rem' }}>
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
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = '#6366f1')}
                onBlur={e => (e.target.style.borderColor = '#2d3f5f')}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '0.875rem',
                background: loading ? '#4f46e5' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                color: '#fff', border: 'none', borderRadius: '0.625rem',
                fontSize: '0.9375rem', fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: '0 0 30px rgba(99,102,241,0.35)',
                transition: 'all 0.2s',
              }}
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', color: '#475569', fontSize: '0.75rem', marginTop: '1.5rem' }}>
          Contact your administrator if you need an account.
        </p>
      </div>
    </div>
  );
}
