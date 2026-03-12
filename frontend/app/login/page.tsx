'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import Link from 'next/link';

export default function LoginPage() {
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (tab === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success('Welcome back!');
        router.push('/dashboard');
        router.refresh();
      } else {
        const { error } = await supabase.auth.signUp({ email, password, options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
        }});
        if (error) throw error;
        toast.success('Account created! Check your email to confirm.');
      }
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
          {/* Tabs */}
          <div style={{
            display: 'flex', background: '#0a0f1e', borderRadius: '0.625rem',
            padding: '0.25rem', marginBottom: '1.75rem',
          }}>
            {(['login', 'signup'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{
                  flex: 1, padding: '0.625rem', borderRadius: '0.5rem',
                  border: 'none', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500,
                  transition: 'all 0.2s',
                  background: tab === t ? '#6366f1' : 'transparent',
                  color: tab === t ? '#fff' : '#64748b',
                }}>
                {t === 'login' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.875rem', marginBottom: '0.375rem' }}>
                Email Address
              </label>
              <input
                type="email" placeholder="recruiter@company.com"
                value={email} onChange={e => setEmail(e.target.value)}
                required style={inputStyle}
                onFocus={e => (e.target.style.borderColor = '#6366f1')}
                onBlur={e => (e.target.style.borderColor = '#2d3f5f')}
              />
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.875rem', marginBottom: '0.375rem' }}>
                Password
              </label>
              <input
                type="password" placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)}
                required minLength={6} style={inputStyle}
                onFocus={e => (e.target.style.borderColor = '#6366f1')}
                onBlur={e => (e.target.style.borderColor = '#2d3f5f')}
              />
            </div>
            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '0.875rem',
              background: loading ? '#4f46e5' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff', border: 'none', borderRadius: '0.625rem',
              fontSize: '0.9375rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 0 30px rgba(99,102,241,0.35)',
              transition: 'all 0.2s',
            }}>
              {loading ? 'Please wait…' : tab === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', color: '#475569', fontSize: '0.8rem', marginTop: '1.5rem' }}>
          By continuing you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
