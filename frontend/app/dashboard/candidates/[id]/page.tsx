'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { candidatesApi } from '@/lib/api';
import Link from 'next/link';
import { use } from 'react';
import { toast } from 'sonner';

interface Props { params: Promise<{ id: string }> }

const HIRING_STATUSES = [
  { value: 'client_screening', label: 'Client Screening', color: '#6366f1' },
  { value: 'interview_l1',    label: 'Interview – L1',    color: '#8b5cf6' },
  { value: 'interview_l2',    label: 'Interview – L2',    color: '#a855f7' },
  { value: 'interview_l3',    label: 'Interview – L3',    color: '#d946ef' },
  { value: 'job_offered',     label: 'Job Offered',       color: '#22c55e' },
  { value: 'rejected',        label: 'Rejected',          color: '#ef4444' },
  { value: 'joined',          label: 'Joined',            color: '#10b981' },
  { value: 'backout',         label: 'Backout',           color: '#f59e0b' },
  { value: 'duplicate',       label: 'Duplicate',         color: '#64748b' },
];

function ScoreRing({ score }: { score: number }) {
  const color = score >= 70 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
  const r = 40, circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width="100" height="100" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="#1e2d4a" strokeWidth="8" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${fill} ${circ - fill}`} strokeLinecap="round" />
      </svg>
      <div style={{ position: 'absolute', textAlign: 'center' }}>
        <div style={{ fontSize: '1.5rem', fontWeight: 800, color }}>{Math.round(score)}</div>
        <div style={{ fontSize: '0.625rem', color: '#64748b' }}>/ 100</div>
      </div>
    </div>
  );
}

function ProgressBar({ value, color = '#6366f1' }: { value: number; color?: string }) {
  return (
    <div style={{ background: '#1e2d4a', borderRadius: '999px', height: '8px' }}>
      <div style={{ background: color, height: '100%', borderRadius: '999px', width: `${Math.min(100, value)}%`, transition: 'width 0.5s ease' }} />
    </div>
  );
}

export default function CandidateDetailPage({ params }: Props) {
  const { id } = use(params);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['candidate', id],
    queryFn: () => candidatesApi.get(id),
  });

  const candidate = data?.candidate;
  const score = candidate?.score_data;
  const hiringStatusInfo = HIRING_STATUSES.find(h => h.value === candidate?.hiring_status);

  if (isLoading) {
    return (
      <div style={{ padding: '2rem', color: '#64748b', textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⟳</div>
        Loading candidate…
      </div>
    );
  }

  if (!candidate) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: '#ef4444' }}>Candidate not found.</p>
        <Link href="/dashboard" style={{ color: '#6366f1' }}>← Dashboard</Link>
      </div>
    );
  }

  const statusColor = score?.status === 'pass' ? '#22c55e' : score?.status === 'review' ? '#f59e0b' : '#ef4444';

  return (
    <div style={{ padding: '2rem', maxWidth: '1000px' }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: '#64748b', fontSize: '0.8rem', marginBottom: '1.5rem' }}>
        <Link href="/dashboard/jobs" style={{ color: '#64748b', textDecoration: 'none' }}>Jobs</Link>
        <span>›</span>
        {candidate.job && (
          <><Link href={`/dashboard/jobs/${candidate.job.id}`} style={{ color: '#64748b', textDecoration: 'none' }}>{candidate.job.job_title}</Link><span>›</span></>
        )}
        <span style={{ color: '#94a3b8' }}>{candidate.name || candidate.resume_file_name}</span>
      </div>

      {/* Hero card */}
      <div style={{
        background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem',
        padding: '1.75rem', marginBottom: '1.5rem',
        display: 'flex', gap: '2rem', alignItems: 'flex-start', flexWrap: 'wrap',
      }}>
        {/* Avatar */}
        <div style={{
          width: '72px', height: '72px', borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.75rem', fontWeight: 700, color: '#fff',
        }}>
          {(candidate.name || candidate.resume_file_name).charAt(0).toUpperCase()}
        </div>

        {/* Info block */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.25rem' }}>
            {candidate.name || 'Unknown Candidate'}
          </h1>
          {candidate.job && (
            <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
              Applied for: <span style={{ color: '#a5b4fc' }}>{candidate.job.job_title}</span> at {candidate.job.company_name}
            </p>
          )}
          <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {candidate.email && <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>✉️ {candidate.email}</span>}
            {candidate.phone && <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>📞 {candidate.phone}</span>}
            {candidate.recruiter_name && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                padding: '0.2rem 0.625rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 500,
                background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', color: '#a5b4fc',
              }}>
                👤 Added by <strong style={{ color: '#e2e8f0' }}>{candidate.recruiter_name}</strong>
              </span>
            )}
          </div>

          {/* Hiring Status badge */}
          {hiringStatusInfo && (
            <div style={{ marginTop: '0.875rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <span style={{
                display: 'inline-block', padding: '0.3rem 0.875rem', borderRadius: '999px',
                fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                background: `${hiringStatusInfo.color}18`, color: hiringStatusInfo.color,
                border: `1px solid ${hiringStatusInfo.color}40`, width: 'fit-content',
              }}>
                🏷️ {hiringStatusInfo.label}
              </span>
              {candidate.hiring_status === 'rejected' && candidate.rejection_reason && (
                <div style={{
                  padding: '0.6rem 0.875rem', borderRadius: '0.5rem',
                  background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
                  color: '#fca5a5', fontSize: '0.8rem', lineHeight: 1.5, maxWidth: '480px',
                }}>
                  <span style={{ color: '#ef4444', fontWeight: 600 }}>Rejection reason: </span>
                  {candidate.rejection_reason}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Score + Status + Download */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
          {score ? (
            <>
              <ScoreRing score={score.score} />
              <span style={{
                padding: '0.375rem 1rem', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.05em',
                color: statusColor, background: `${statusColor}18`, border: `1px solid ${statusColor}40`,
              }}>{score.status}</span>
            </>
          ) : (
            <div style={{ color: '#64748b', fontSize: '0.875rem', textAlign: 'center' }}>
              {candidate.processing_status === 'processing' ? '⟳ Scoring…' : '⏳ Pending'}
            </div>
          )}
          <div>
            {candidate.resume_download_url ? (
              <a href={candidate.resume_download_url} target="_blank" rel="noopener noreferrer" style={{
                padding: '0.625rem 1.25rem', borderRadius: '0.5rem',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff',
                textDecoration: 'none', fontSize: '0.875rem', fontWeight: 600, display: 'block',
                whiteSpace: 'nowrap', boxShadow: '0 0 15px rgba(99,102,241,0.3)',
              }}>📥 Download Resume</a>
            ) : (
              <button disabled style={{
                padding: '0.625rem 1.25rem', borderRadius: '0.5rem',
                background: '#1e2d4a', color: '#64748b', border: '1px solid #2d3f5f',
                fontSize: '0.875rem', cursor: 'not-allowed',
              }}>Resume N/A</button>
            )}
          </div>
        </div>
      </div>

      {score && (
        <>
          {/* AI Summary */}
          <div style={{ background: '#0d1526', border: '1px solid rgba(99,102,241,0.25)', borderRadius: '1rem', padding: '1.5rem', marginBottom: '1.5rem', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }} />
            <h2 style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: '0.75rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              🤖 AI Summary
            </h2>
            <p style={{ color: '#94a3b8', lineHeight: 1.7, fontSize: '0.9rem' }}>{score.summary}</p>
          </div>

          {/* Score Breakdown */}
          <div style={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem', padding: '1.5rem', marginBottom: '1.5rem' }}>
            <h2 style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: '1.25rem', fontSize: '1rem' }}>Score Breakdown</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {[
                { label: 'Overall Fit', value: score.score, color: score.score >= 70 ? '#22c55e' : score.score >= 50 ? '#f59e0b' : '#ef4444' },
                { label: 'Experience Match', value: score.experience_match, color: '#6366f1' },
                { label: 'Education Match', value: score.education_match, color: '#8b5cf6' },
              ].map(item => (
                <div key={item.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
                    <span style={{ color: '#94a3b8', fontSize: '0.875rem' }}>{item.label}</span>
                    <span style={{ color: item.color, fontWeight: 700, fontSize: '0.875rem' }}>{Math.round(item.value)}%</span>
                  </div>
                  <ProgressBar value={item.value} color={item.color} />
                </div>
              ))}
            </div>
          </div>

          {/* Strengths & Weaknesses */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
            <div style={{ background: '#0d1526', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '1rem', padding: '1.5rem' }}>
              <h2 style={{ color: '#22c55e', fontWeight: 600, marginBottom: '1rem', fontSize: '0.9rem' }}>✅ Strengths</h2>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {score.strengths.map((s, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', color: '#94a3b8', fontSize: '0.8rem', lineHeight: 1.5 }}>
                    <span style={{ color: '#22c55e', flexShrink: 0 }}>•</span> {s}
                  </li>
                ))}
              </ul>
            </div>
            <div style={{ background: '#0d1526', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '1rem', padding: '1.5rem' }}>
              <h2 style={{ color: '#ef4444', fontWeight: 600, marginBottom: '1rem', fontSize: '0.9rem' }}>⚠️ Weaknesses</h2>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {score.weaknesses.map((w, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', color: '#94a3b8', fontSize: '0.8rem', lineHeight: 1.5 }}>
                    <span style={{ color: '#ef4444', flexShrink: 0 }}>•</span> {w}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Skills */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div style={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem', padding: '1.5rem' }}>
              <h2 style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: '1rem', fontSize: '0.9rem' }}>✅ Matched Skills</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {score.matched_skills.map(s => (
                  <span key={s} style={{ padding: '0.25rem 0.625rem', borderRadius: '4px', fontSize: '0.75rem', background: 'rgba(34,197,94,0.1)', color: '#86efac', border: '1px solid rgba(34,197,94,0.2)' }}>{s}</span>
                ))}
                {score.matched_skills.length === 0 && <span style={{ color: '#64748b', fontSize: '0.8rem' }}>None detected</span>}
              </div>
            </div>
            <div style={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem', padding: '1.5rem' }}>
              <h2 style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: '1rem', fontSize: '0.9rem' }}>❌ Missing Skills</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {score.missing_skills.map(s => (
                  <span key={s} style={{ padding: '0.25rem 0.625rem', borderRadius: '4px', fontSize: '0.75rem', background: 'rgba(239,68,68,0.1)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.2)' }}>{s}</span>
                ))}
                {score.missing_skills.length === 0 && <span style={{ color: '#64748b', fontSize: '0.8rem' }}>None missing</span>}
              </div>
            </div>
          </div>
        </>
      )}

      {!score && candidate.processing_status === 'failed' && (
        <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '1rem', padding: '1.5rem' }}>
          <h3 style={{ color: '#ef4444', marginBottom: '0.5rem' }}>Processing Failed</h3>
          <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>{candidate.error_message || 'Unknown error occurred during processing.'}</p>
        </div>
      )}
    </div>
  );
}
