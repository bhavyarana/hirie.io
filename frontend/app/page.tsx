'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';

const NAV_LINKS = ['Features', 'How It Works', 'Roles'];

const FEATURES = [
  { icon: '🤖', color: '#6366f1', title: 'AI Resume Scoring', desc: 'Mistral-powered rubric scoring across 4 dimensions — technical skills, experience, education, and soft skills — with per-job custom weights.' },
  { icon: '📊', color: '#8b5cf6', title: 'Role-Based Analytics', desc: 'Deep dashboards scoped per role. Admins see org-wide funnels. Managers track recruiter output. TLs monitor team pipelines.' },
  { icon: '🏢', color: '#06b6d4', title: 'Multi-Team Org Structure', desc: 'Full org hierarchy: Admin → Manager → Team Lead → Recruiter. Every user sees only what they need, nothing more.' },
  { icon: '🎯', color: '#f59e0b', title: 'Custom Scoring Criteria', desc: 'Set pass/review/fail thresholds and dimension weights per job. The AI adapts its scoring model for each opening.' },
  { icon: '🔍', color: '#22c55e', title: 'Talent Pool Search', desc: 'Search your entire candidate database by skills, job title, and experience. Source pre-vetted candidates proactively.' },
  { icon: '⚡', color: '#a78bfa', title: 'Real-Time Pipeline', desc: 'BullMQ background processing with live status streaming. Upload 100 resumes simultaneously — no waiting.' },
  { icon: '📤', color: '#f472b6', title: 'Smart Upload Access', desc: 'Admins, managers, TLs, and assigned recruiters can all upload. Access is scoped to your job assignments automatically.' },
  { icon: '📥', color: '#34d399', title: 'CSV Export & Reports', desc: 'Export all candidate data, scores, matched skills, and insights with one click for any job.' },
];

const ROLES = [
  { role: 'Admin', icon: '👑', color: '#f59e0b', perks: ['Full platform analytics', 'Manage all users & teams', 'View all jobs & candidates', 'Configure org structure'] },
  { role: 'Manager', icon: '👔', color: '#6366f1', perks: ['Create & manage jobs', 'Team performance analytics', 'Recruiter leaderboard', 'Custom scoring criteria'] },
  { role: 'Team Lead', icon: '🧭', color: '#22c55e', perks: ['Team job pipeline', 'Recruiter activity tracking', 'Top candidate insights', 'Upload resumes for jobs'] },
  { role: 'Recruiter', icon: '🧑‍💻', color: '#06b6d4', perks: ['Upload & manage candidates', 'Personal funnel analytics', 'Matched skill insights', 'Pipeline status tracking'] },
];

const STATS = [
  { value: '100', label: 'Resumes per batch', icon: '📄' },
  { value: '4', label: 'Role-specific views', icon: '👥' },
  { value: 'AI', label: 'Scoring per dimension', icon: '🤖' },
  { value: '<5s', label: 'Per resume scored', icon: '⚡' },
];

export default function LandingPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div style={{ minHeight: '100vh', background: '#060b14', fontFamily: '"Inter", system-ui, sans-serif', color: '#e2e8f0' }}>

      {/* ── Navbar ──────────────────────────────────────────────────────── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        padding: '0.875rem 2.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(6,11,20,0.85)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(30,45,74,0.5)',
      }}>
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.375rem' }}>🔮</span>
          <span style={{ fontSize: '1.125rem', fontWeight: 800, color: '#e2e8f0', letterSpacing: '-0.01em' }}>
            Resume<span style={{ color: '#6366f1' }}>Flow</span>
          </span>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          {NAV_LINKS.map(l => (
            <a key={l} href={`#${l.toLowerCase().replace(/ /g, '-')}`} style={{ color: '#64748b', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 500, transition: 'color 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#e2e8f0')}
              onMouseLeave={e => (e.currentTarget.style.color = '#64748b')}
            >{l}</a>
          ))}
          <Link href="/login" style={{ padding: '0.5rem 1.25rem', borderRadius: '0.5rem', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', textDecoration: 'none', fontSize: '0.8rem', fontWeight: 600, boxShadow: '0 0 20px rgba(99,102,241,0.3)' }}>
            Sign In →
          </Link>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        padding: '9rem 1.5rem 5rem',
        background: 'radial-gradient(ellipse 90% 65% at 50% -5%, rgba(99,102,241,0.14) 0%, transparent 65%)',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Floating orbs */}
        <div style={{ position: 'absolute', top: '20%', left: '8%', width: '320px', height: '320px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.07) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '15%', right: '6%', width: '260px', height: '260px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />

        {mounted && (
          <>
            {/* Badge */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.375rem 1rem', borderRadius: '999px', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', marginBottom: '2rem', animation: 'fadeInUp 0.5s ease forwards' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#6366f1', animation: 'pulse 2s infinite' }} />
              <span style={{ color: '#a5b4fc', fontSize: '0.78rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>AI-Powered Hiring Intelligence Platform</span>
            </div>

            {/* Headline */}
            <h1 style={{ fontSize: 'clamp(2.5rem, 6vw, 4.75rem)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.03em', marginBottom: '1.5rem', animation: 'fadeInUp 0.5s ease 0.1s both' }}>
              <span style={{ color: '#e2e8f0' }}>Hire smarter.</span>
              <br />
              <span style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 45%, #a78bfa 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Scale faster. Know more.
              </span>
            </h1>

            {/* Sub */}
            <p style={{ fontSize: 'clamp(1rem, 2vw, 1.2rem)', color: '#64748b', maxWidth: '620px', lineHeight: 1.75, marginBottom: '2.75rem', animation: 'fadeInUp 0.5s ease 0.2s both' }}>
              From AI resume scoring to org-wide analytics — ResumeFlow is the command center for every team in your hiring org. Not just an ATS. A full hiring intelligence platform.
            </p>

            {/* CTAs */}
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center', animation: 'fadeInUp 0.5s ease 0.3s both' }}>
              <Link href="/login" style={{ padding: '0.9rem 2.25rem', borderRadius: '0.75rem', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', textDecoration: 'none', fontSize: '0.975rem', fontWeight: 700, boxShadow: '0 0 40px rgba(99,102,241,0.35)', transition: 'all 0.2s' }}
                onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-2px)')}
                onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0)')}
              >Get Started Free →</Link>
              <a href="#features" style={{ padding: '0.9rem 2.25rem', borderRadius: '0.75rem', border: '1px solid rgba(99,102,241,0.25)', background: 'rgba(99,102,241,0.05)', color: '#a5b4fc', textDecoration: 'none', fontSize: '0.975rem', fontWeight: 500, transition: 'all 0.2s' }}
                onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(99,102,241,0.5)')}
                onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(99,102,241,0.25)')}
              >Explore Features</a>
            </div>
          </>
        )}
      </section>

      {/* ── Stats bar ───────────────────────────────────────────────────── */}
      <section style={{ borderTop: '1px solid rgba(30,45,74,0.5)', borderBottom: '1px solid rgba(30,45,74,0.5)', padding: '2.5rem 1.5rem', background: 'rgba(13,21,38,0.5)' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1.5rem' }}>
          {STATS.map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>{s.icon}</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, background: 'linear-gradient(135deg,#6366f1,#a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{s.value}</div>
              <div style={{ color: '#475569', fontSize: '0.78rem', marginTop: '0.2rem' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────────── */}
      <section id="features" style={{ padding: '6rem 1.5rem' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
            <p style={{ color: '#6366f1', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>CAPABILITIES</p>
            <h2 style={{ fontSize: 'clamp(1.75rem,4vw,2.75rem)', fontWeight: 800, letterSpacing: '-0.02em', color: '#e2e8f0', marginBottom: '1rem' }}>
              Way more than an ATS.
            </h2>
            <p style={{ color: '#64748b', fontSize: '1rem', maxWidth: '520px', margin: '0 auto', lineHeight: 1.7 }}>
              Every feature built for real hiring teams — smart, scoped, and connected from candidate upload to final decision.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: '1.25rem' }}>
            {FEATURES.map(f => (
              <div key={f.title} style={{ padding: '1.375rem 1.5rem', borderRadius: '1rem', background: '#0d1526', border: '1px solid #1a2840', transition: 'all 0.2s ease', cursor: 'default' }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = `${f.color}50`; el.style.background = `${f.color}08`; el.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = '#1a2840'; el.style.background = '#0d1526'; el.style.transform = 'translateY(0)'; }}
              >
                <div style={{ width: '38px', height: '38px', borderRadius: '0.625rem', background: `${f.color}18`, border: `1px solid ${f.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.125rem', marginBottom: '0.875rem' }}>{f.icon}</div>
                <h3 style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.4rem' }}>{f.title}</h3>
                <p style={{ color: '#475569', fontSize: '0.78rem', lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ────────────────────────────────────────────────── */}
      <section id="how-it-works" style={{ padding: '5rem 1.5rem', borderTop: '1px solid rgba(30,45,74,0.4)', background: 'rgba(13,21,38,0.3)' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
          <p style={{ color: '#6366f1', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>HOW IT WORKS</p>
          <h2 style={{ fontSize: 'clamp(1.75rem,4vw,2.5rem)', fontWeight: 800, letterSpacing: '-0.02em', color: '#e2e8f0', marginBottom: '3rem' }}>From upload to decision in minutes.</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {[
              { step: '01', title: 'Create a Job', desc: 'Define the role, required skills, and configure custom AI scoring criteria — thresholds and dimension weights.', icon: '💼' },
              { step: '02', title: 'Assign Your Team', desc: 'Assign managers, team leads, and recruiters. Each role gets scoped access and relevant data views.', icon: '👥' },
              { step: '03', title: 'Upload Resumes', desc: 'Batch upload up to 100 resumes at once. PDF and DOCX supported. AI processes everything in the background.', icon: '📤' },
              { step: '04', title: 'AI Scores & Ranks', desc: 'Each resume is scored across 4 dimensions using your custom weights. Pass, review, or fail — automatically.', icon: '🤖' },
              { step: '05', title: 'Analyze & Decide', desc: 'Review role-specific analytics dashboards, top candidates, skill gaps, and team performance in one place.', icon: '📊' },
            ].map((item, i, arr) => (
              <div key={item.step} style={{ display: 'flex', gap: '1.5rem', textAlign: 'left', position: 'relative' }}>
                {/* Line */}
                {i < arr.length - 1 && (
                  <div style={{ position: 'absolute', left: '22px', top: '50px', bottom: '-16px', width: '1px', background: 'rgba(30,45,74,0.8)', zIndex: 0 }} />
                )}
                {/* Step circle */}
                <div style={{ flexShrink: 0, width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, color: '#6366f1', zIndex: 1, marginTop: '0.5rem' }}>{item.step}</div>
                <div style={{ paddingBottom: i < arr.length - 1 ? '2rem' : 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                    <span style={{ fontSize: '1rem' }}>{item.icon}</span>
                    <h3 style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '0.95rem' }}>{item.title}</h3>
                  </div>
                  <p style={{ color: '#64748b', fontSize: '0.83rem', lineHeight: 1.65, margin: 0 }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Roles ───────────────────────────────────────────────────────── */}
      <section id="roles" style={{ padding: '5rem 1.5rem', borderTop: '1px solid rgba(30,45,74,0.4)' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <p style={{ color: '#6366f1', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>ROLE-BASED ACCESS</p>
            <h2 style={{ fontSize: 'clamp(1.75rem,4vw,2.5rem)', fontWeight: 800, letterSpacing: '-0.02em', color: '#e2e8f0', marginBottom: '0.75rem' }}>Built for every seat in your org.</h2>
            <p style={{ color: '#64748b', fontSize: '0.95rem' }}>Each role gets exactly the tools and data they need — nothing more, nothing less.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: '1.25rem' }}>
            {ROLES.map(r => (
              <div key={r.role} style={{ padding: '1.5rem', borderRadius: '1rem', background: '#0d1526', border: `1px solid ${r.color}20`, transition: 'all 0.2s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = `${r.color}45`; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = `${r.color}20`; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1rem' }}>
                  <span style={{ fontSize: '1.375rem' }}>{r.icon}</span>
                  <span style={{ color: r.color, fontWeight: 700, fontSize: '0.9rem' }}>{r.role}</span>
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {r.perks.map(p => (
                    <li key={p} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.45rem', color: '#64748b', fontSize: '0.78rem', lineHeight: 1.5 }}>
                      <span style={{ color: r.color, flexShrink: 0, marginTop: '0.05rem' }}>✓</span>{p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────── */}
      <section style={{ padding: '6rem 1.5rem', textAlign: 'center', background: 'radial-gradient(ellipse 70% 80% at 50% 100%, rgba(99,102,241,0.1) 0%, transparent 65%)' }}>
        <h2 style={{ fontSize: 'clamp(2rem,5vw,3rem)', fontWeight: 800, color: '#e2e8f0', letterSpacing: '-0.02em', marginBottom: '1rem' }}>
          Ready to level up your hiring?
        </h2>
        <p style={{ color: '#64748b', fontSize: '1rem', marginBottom: '2.5rem', maxWidth: '480px', margin: '0 auto 2.5rem', lineHeight: 1.7 }}>
          One platform for your entire team. AI that actually works. Analytics that actually matter.
        </p>
        <Link href="/login" style={{ display: 'inline-block', padding: '1rem 2.75rem', borderRadius: '0.875rem', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', textDecoration: 'none', fontSize: '1rem', fontWeight: 700, boxShadow: '0 0 50px rgba(99,102,241,0.35)', transition: 'all 0.2s' }}
          onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-2px)')}
          onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0)')}
        >Start Hiring Smarter →</Link>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer style={{ padding: '1.75rem 2.5rem', borderTop: '1px solid rgba(30,45,74,0.5)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ fontSize: '1rem' }}>🔮</span>
          <span style={{ color: '#334155', fontSize: '0.8rem', fontWeight: 600 }}>Resume<span style={{ color: '#6366f1' }}>Flow</span></span>
        </div>
        <p style={{ color: '#334155', fontSize: '0.75rem', margin: 0 }}>© 2026 ResumeFlow · AI Hiring Intelligence Platform</p>
        <Link href="/login" style={{ color: '#6366f1', fontSize: '0.75rem', textDecoration: 'none', fontWeight: 500 }}>Sign In →</Link>
      </footer>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        :root { scroll-behavior: smooth; }
      `}</style>
    </div>
  );
}
