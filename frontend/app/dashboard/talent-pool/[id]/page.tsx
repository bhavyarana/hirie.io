'use client';

import { useQuery } from '@tanstack/react-query';
import { talentPoolApi, type TalentPoolCandidate } from '@/lib/api';
import Link from 'next/link';
import { use } from 'react';

interface Props { params: Promise<{ id: string }> }

// ─── Helpers ────────────────────────────────────────────────────────────────

function Avatar({ name, email }: { name: string | null; email: string | null }) {
  const initials = ((name || email || '?').slice(0, 2)).toUpperCase();
  return (
    <div style={{
      width: '72px', height: '72px', borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: '1.75rem', fontWeight: 700,
    }}>
      {initials}
    </div>
  );
}

function SkillChip({ label, color = 'indigo' }: { label: string; color?: 'indigo' | 'green' | 'red' }) {
  const styles: Record<string, React.CSSProperties> = {
    indigo: { background: 'rgba(99,102,241,0.12)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.25)' },
    green:  { background: 'rgba(34,197,94,0.1)',   color: '#86efac', border: '1px solid rgba(34,197,94,0.2)'  },
    red:    { background: 'rgba(239,68,68,0.1)',    color: '#fca5a5', border: '1px solid rgba(239,68,68,0.2)'  },
  };
  return (
    <span style={{
      padding: '0.22rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 500,
      whiteSpace: 'nowrap', ...styles[color],
    }}>
      {label}
    </span>
  );
}

function SectionCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: '1rem', padding: '1.5rem', ...style,
    }}>
      {children}
    </div>
  );
}

function SectionHeading({ icon, label }: { icon: string; label: string }) {
  return (
    <h2 style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.95rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
      {icon} {label}
    </h2>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function TalentPoolProfilePage({ params }: Props) {
  const { id } = use(params);

  const { data, isLoading } = useQuery({
    queryKey: ['talent-pool-profile', id],
    queryFn: () => talentPoolApi.get(id),
  });

  const candidate = data?.candidate as TalentPoolCandidate | undefined;

  // ── Loading ──
  if (isLoading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>⟳</div>
        Loading candidate profile…
      </div>
    );
  }

  // ── Not found ──
  if (!candidate) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: '#ef4444', marginBottom: '1rem' }}>Candidate not found.</p>
        <Link href="/dashboard/talent-pool" style={{ color: '#6366f1', textDecoration: 'none' }}>
          ← Back to Talent Pool
        </Link>
      </div>
    );
  }

  const uploadedDate = new Date(candidate.created_at).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  const strengths: string[] = candidate.strengths || [];
  const weaknesses: string[] = candidate.weaknesses || [];
  const skills: string[] = candidate.extracted_skills || [];
  const titles: string[] = candidate.extracted_titles || [];

  return (
    <div style={{ padding: '2rem', maxWidth: '1000px' }}>

      {/* ── Breadcrumb ── */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1.75rem' }}>
        <Link href="/dashboard/talent-pool" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
          🔍 Talent Pool
        </Link>
        <span>›</span>
        <span style={{ color: 'var(--text-secondary)' }}>{candidate.name || candidate.resume_file_name}</span>
      </div>

      {/* ── Hero Card ── */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem',
        padding: '1.75rem', marginBottom: '1.5rem',
        display: 'flex', gap: '2rem', alignItems: 'flex-start', flexWrap: 'wrap',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Accent line */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }} />

        <Avatar name={candidate.name} email={candidate.email} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
            {candidate.name || 'Unknown Candidate'}
          </h1>

          {/* Titles */}
          {titles.length > 0 && (
            <p style={{ color: '#6366f1', fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.6rem' }}>
              {titles.join(' · ')}
            </p>
          )}

          {/* Contact row */}
          <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.75rem' }}>
            {candidate.email && (
              <a href={`mailto:${candidate.email}`} style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                ✉️ {candidate.email}
              </a>
            )}
            {candidate.phone && (
              <a href={`tel:${candidate.phone}`} style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                📞 {candidate.phone}
              </a>
            )}
            {candidate.current_location && (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                📍 {candidate.current_location}
              </span>
            )}
            {candidate.experience_years != null && (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                ⏱ {candidate.experience_years} yr exp
              </span>
            )}
          </div>

          {/* Upload metadata */}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
              padding: '0.22rem 0.7rem', borderRadius: '999px', fontSize: '0.74rem', fontWeight: 500,
              background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', color: '#a5b4fc',
            }}>
              👤 Uploaded by <strong style={{ color: 'var(--text-primary)' }}>{candidate.uploaded_by_name || 'Unknown'}</strong>
            </span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
              padding: '0.22rem 0.7rem', borderRadius: '999px', fontSize: '0.74rem', fontWeight: 500,
              background: 'rgba(99,102,241,0.05)', border: '1px solid var(--border)', color: 'var(--text-muted)',
            }}>
              🗓 {uploadedDate}
            </span>
            {candidate.first_seen_job_title && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                padding: '0.22rem 0.7rem', borderRadius: '999px', fontSize: '0.74rem', fontWeight: 500,
                background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.2)', color: '#c4b5fd',
              }}>
                💼 {candidate.first_seen_job_title}
              </span>
            )}
          </div>
        </div>

        {/* Download Resume */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          {candidate.resume_download_url ? (
            <a
              href={candidate.resume_download_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '0.65rem 1.25rem', borderRadius: '0.625rem',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff',
                textDecoration: 'none', fontSize: '0.875rem', fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                whiteSpace: 'nowrap', boxShadow: '0 0 18px rgba(99,102,241,0.3)',
              }}
            >
              📥 Download Resume
            </a>
          ) : (
            <button disabled style={{
              padding: '0.65rem 1.25rem', borderRadius: '0.625rem',
              background: 'var(--bg-secondary)', color: 'var(--text-muted)',
              border: '1px solid var(--border)', fontSize: '0.875rem', cursor: 'not-allowed',
            }}>
              Resume N/A
            </button>
          )}
          <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
            {candidate.resume_file_name}
          </span>
        </div>
      </div>

      {/* ── AI Summary ── */}
      {candidate.summary && (
        <SectionCard style={{ marginBottom: '1.5rem', position: 'relative', overflow: 'hidden', borderColor: 'rgba(99,102,241,0.25)' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }} />
          <SectionHeading icon="🤖" label="AI Summary" />
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.75, fontSize: '0.9rem' }}>
            {candidate.summary}
          </p>
        </SectionCard>
      )}

      {/* ── Strengths & Weaknesses ── */}
      {(strengths.length > 0 || weaknesses.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
          {strengths.length > 0 && (
            <SectionCard style={{ borderColor: 'rgba(34,197,94,0.2)' }}>
              <SectionHeading icon="✅" label="Strengths" />
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {strengths.map((s, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.55 }}>
                    <span style={{ color: '#22c55e', flexShrink: 0, marginTop: '0.1rem' }}>•</span> {s}
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
          {weaknesses.length > 0 && (
            <SectionCard style={{ borderColor: 'rgba(239,68,68,0.2)' }}>
              <SectionHeading icon="⚠️" label="Weaknesses" />
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {weaknesses.map((w, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.55 }}>
                    <span style={{ color: '#ef4444', flexShrink: 0, marginTop: '0.1rem' }}>•</span> {w}
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
        </div>
      )}

      {/* ── Skills ── */}
      {skills.length > 0 && (
        <SectionCard style={{ marginBottom: '1.5rem' }}>
          <SectionHeading icon="🛠️" label={`Skills (${skills.length})`} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
            {skills.map(s => <SkillChip key={s} label={s} />)}
          </div>
        </SectionCard>
      )}

      {/* ── Professional Titles ── */}
      {titles.length > 0 && (
        <SectionCard>
          <SectionHeading icon="🏷️" label="Professional Titles" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
            {titles.map(t => (
              <span key={t} style={{
                padding: '0.3rem 0.75rem', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 500,
                background: 'rgba(139,92,246,0.1)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.22)',
              }}>
                {t}
              </span>
            ))}
          </div>
        </SectionCard>
      )}

      {/* ── Empty state when no analytics at all ── */}
      {!candidate.summary && strengths.length === 0 && weaknesses.length === 0 && skills.length === 0 && (
        <SectionCard>
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📄</div>
            <p style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Resume Not Yet Analysed</p>
            <p style={{ fontSize: '0.85rem' }}>
              This candidate's resume has not been processed against any job yet. Upload it to a job to extract AI insights.
            </p>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
