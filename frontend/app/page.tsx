'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';

const features = [
  {
    icon: '⚡',
    title: 'Batch Processing',
    desc: 'Upload 100 resumes at once. Our async pipeline handles everything without blocking.',
  },
  {
    icon: '🤖',
    title: 'AI Scoring',
    desc: 'GPT-4 analyzes every resume and scores candidates against your job requirements.',
  },
  {
    icon: '📊',
    title: 'Analytics Dashboard',
    desc: 'Visualize score distribution, skill gaps, and candidate quality at a glance.',
  },
  {
    icon: '🎯',
    title: 'Smart Shortlisting',
    desc: 'Automatic Pass / Review / Fail categorization based on AI confidence scores.',
  },
  {
    icon: '📄',
    title: 'OCR Fallback',
    desc: 'Even scanned resumes are parsed with Tesseract OCR for complete coverage.',
  },
  {
    icon: '📥',
    title: 'CSV Export',
    desc: 'Export all candidate data, scores, and insights with a single click.',
  },
];

const stats = [
  { value: '10x', label: 'Faster Screening' },
  { value: '100', label: 'Resumes per Batch' },
  { value: '95%', label: 'Parse Accuracy' },
  { value: '<30s', label: 'Per Resume' },
];

export default function LandingPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0f1e' }}>
      {/* Nav */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        padding: '1rem 2rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(10,15,30,0.8)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(99,102,241,0.1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.5rem' }}>🔮</span>
          <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#e2e8f0' }}>
            Resume<span style={{ color: '#6366f1' }}>Flow</span>
          </span>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <Link href="/login" style={{
            padding: '0.5rem 1.25rem', borderRadius: '0.5rem',
            color: '#94a3b8', textDecoration: 'none', fontSize: '0.875rem',
            transition: 'color 0.2s',
          }}>Sign In</Link>
          <Link href="/login" style={{
            padding: '0.5rem 1.25rem', borderRadius: '0.5rem',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff', textDecoration: 'none', fontSize: '0.875rem',
            fontWeight: 600, boxShadow: '0 0 20px rgba(99,102,241,0.4)',
          }}>Get Started Free</Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        padding: '8rem 1.5rem 4rem',
        background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(99,102,241,0.15) 0%, transparent 70%)',
      }}>
        {mounted && (
          <>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.375rem 1rem', borderRadius: '999px', marginBottom: '2rem',
              background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)',
              color: '#a5b4fc', fontSize: '0.875rem', fontWeight: 500,
              animation: 'fadeInUp 0.5s ease forwards',
            }}>
              <span>✨</span> AI-Powered Candidate Screening
            </div>
            <h1 style={{
              fontSize: 'clamp(2.5rem, 6vw, 4.5rem)', fontWeight: 800,
              lineHeight: 1.1, marginBottom: '1.5rem',
              animation: 'fadeInUp 0.5s ease 0.1s both',
            }}>
              <span style={{ color: '#e2e8f0' }}>Screen Resumes</span>
              <br />
              <span style={{
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a78bfa 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>10× Faster with AI</span>
            </h1>
            <p style={{
              fontSize: '1.125rem', color: '#94a3b8', maxWidth: '600px',
              lineHeight: 1.7, marginBottom: '2.5rem',
              animation: 'fadeInUp 0.5s ease 0.2s both',
            }}>
              Upload your job description, batch upload up to 100 resumes, and get AI-scored
              rankings in minutes. Stop wasting time on manual screening.
            </p>
            <div style={{
              display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center',
              animation: 'fadeInUp 0.5s ease 0.3s both',
            }}>
              <Link href="/login" style={{
                padding: '0.875rem 2rem', borderRadius: '0.75rem',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                color: '#fff', textDecoration: 'none', fontSize: '1rem', fontWeight: 600,
                boxShadow: '0 0 40px rgba(99,102,241,0.4)',
                transition: 'all 0.2s ease',
              }}>Start Screening Free →</Link>
              <a href="#features" style={{
                padding: '0.875rem 2rem', borderRadius: '0.75rem',
                border: '1px solid rgba(99,102,241,0.3)',
                color: '#a5b4fc', textDecoration: 'none', fontSize: '1rem',
                background: 'rgba(99,102,241,0.05)',
              }}>See How It Works</a>
            </div>
          </>
        )}
      </section>

      {/* Stats */}
      <section style={{
        padding: '3rem 1.5rem',
        borderTop: '1px solid rgba(30,45,74,0.5)',
        borderBottom: '1px solid rgba(30,45,74,0.5)',
      }}>
        <div style={{
          maxWidth: '1000px', margin: '0 auto',
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2rem',
        }}>
          {stats.map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{
                fontSize: '2.5rem', fontWeight: 800,
                background: 'linear-gradient(135deg, #6366f1, #a78bfa)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>{s.value}</div>
              <div style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '0.25rem' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" style={{ padding: '6rem 1.5rem' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <h2 style={{
            textAlign: 'center', fontSize: '2rem', fontWeight: 700,
            color: '#e2e8f0', marginBottom: '1rem',
          }}>Everything You Need</h2>
          <p style={{ textAlign: 'center', color: '#64748b', marginBottom: '3rem' }}>
            A complete ATS pipeline powered by modern AI
          </p>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem',
          }}>
            {features.map(f => (
              <div key={f.title} style={{
                padding: '1.5rem', borderRadius: '1rem',
                background: '#0d1526', border: '1px solid #1e2d4a',
                transition: 'all 0.2s ease',
              }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(99,102,241,0.4)';
                  (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = '#1e2d4a';
                  (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
                }}
              >
                <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>{f.icon}</div>
                <h3 style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: '0.5rem' }}>{f.title}</h3>
                <p style={{ color: '#64748b', fontSize: '0.875rem', lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{
        padding: '6rem 1.5rem', textAlign: 'center',
        background: 'radial-gradient(ellipse 60% 80% at 50% 100%, rgba(99,102,241,0.1) 0%, transparent 70%)',
      }}>
        <h2 style={{ fontSize: '2.5rem', fontWeight: 800, color: '#e2e8f0', marginBottom: '1rem' }}>
          Ready to Transform Your Hiring?
        </h2>
        <p style={{ color: '#64748b', marginBottom: '2rem', fontSize: '1.125rem' }}>
          Join recruiters who screen candidates 10x faster with ResumeFlow.
        </p>
        <Link href="/login" style={{
          padding: '1rem 2.5rem', borderRadius: '0.875rem',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          color: '#fff', textDecoration: 'none', fontSize: '1.125rem', fontWeight: 700,
          boxShadow: '0 0 50px rgba(99,102,241,0.4)',
          display: 'inline-block',
        }}>Get Started Free →</Link>
      </section>

      {/* Footer */}
      <footer style={{
        padding: '2rem 1.5rem', textAlign: 'center',
        borderTop: '1px solid #1e2d4a', color: '#64748b', fontSize: '0.875rem',
      }}>
        © 2026 ResumeFlow. AI-Powered Candidate Screening.
      </footer>
    </div>
  );
}
