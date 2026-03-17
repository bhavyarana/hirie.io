'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { candidatesApi, jobsApi, Candidate } from '@/lib/api';
import { useUserContext } from '@/lib/context/UserContext';
import { toast } from 'sonner';
import Link from 'next/link';

// ─── Constants ────────────────────────────────────────────────────────────────

const SCORE_FILTERS = [
  { label: 'All', value: '' },
  { label: 'Pass ✓', value: 'pass', color: '#22c55e' },
  { label: 'Review 👀', value: 'review', color: '#f59e0b' },
  { label: 'Fail ✗', value: 'fail', color: '#ef4444' },
  { label: 'Pending ⏳', value: 'pending', color: '#64748b' },
];

const PIPELINE_STATUSES = ['uploaded', 'scored', 'shortlisted', 'interview', 'rejected'] as const;

const PIPELINE_COLORS: Record<string, string> = {
  uploaded: '#64748b', scored: '#6366f1', shortlisted: '#22c55e',
  interview: '#f59e0b', rejected: '#ef4444',
};

export const HIRING_STATUSES = [
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

const HIRING_COLOR: Record<string, string> = Object.fromEntries(HIRING_STATUSES.map(s => [s.value, s.color]));

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScorePill({ score, status }: { score: number | null; status: string | null }) {
  const colorMap: Record<string, { bg: string; text: string; border: string }> = {
    pass:   { bg: 'rgba(34,197,94,0.12)',  text: '#22c55e', border: 'rgba(34,197,94,0.3)' },
    review: { bg: 'rgba(245,158,11,0.12)', text: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
    fail:   { bg: 'rgba(239,68,68,0.12)',  text: '#ef4444', border: 'rgba(239,68,68,0.3)' },
  };
  const s = colorMap[status || ''] || { bg: 'rgba(100,116,139,0.12)', text: '#64748b', border: 'rgba(100,116,139,0.3)' };
  return (
    <span style={{ padding: '0.18rem 0.6rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', background: s.bg, color: s.text, border: `1px solid ${s.border}` }}>
      {score != null ? `${Math.round(score)}  ` : ''}{status || 'pending'}
    </span>
  );
}

function HiringBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const hs = HIRING_STATUSES.find(h => h.value === status);
  if (!hs) return null;
  return (
    <span style={{
      padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.68rem', fontWeight: 600,
      background: `${hs.color}18`, color: hs.color, border: `1px solid ${hs.color}40`,
      whiteSpace: 'nowrap',
    }}>
      {hs.label}
    </span>
  );
}

function PipelineBadge({ status }: { status: string }) {
  const color = PIPELINE_COLORS[status] || '#64748b';
  return (
    <span style={{ padding: '0.18rem 0.55rem', borderRadius: '999px', fontSize: '0.68rem', fontWeight: 600, background: `${color}18`, color, border: `1px solid ${color}40` }}>
      {status}
    </span>
  );
}

function SkillChip({ label }: { label: string }) {
  return (
    <span style={{ padding: '0.18rem 0.55rem', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 500, background: 'rgba(99,102,241,0.1)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.2)', whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

// ─── Hiring Status Inline Editor ──────────────────────────────────────────────

function HiringStatusEditor({ c, onSave }: {
  c: Candidate;
  onSave: (id: string, hiring_status: string, rejection_reason?: string) => void;
}) {
  const [localStatus, setLocalStatus] = useState(c.hiring_status || '');
  const [reason, setReason] = useState(c.rejection_reason || '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', paddingTop: '0.5rem', borderTop: '1px solid #1e2d4a' }}>
      <label style={{ color: '#475569', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hiring Status</label>
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={localStatus}
          onChange={e => {
            setLocalStatus(e.target.value);
            if (e.target.value !== 'rejected') {
              // Auto-save non-rejection statuses immediately
              onSave(c.id, e.target.value);
            }
          }}
          style={{
            flex: 1, minWidth: '140px', background: '#111827', border: '1px solid #1e2d4a',
            borderRadius: '0.5rem', padding: '0.35rem 0.5rem',
            color: localStatus ? (HIRING_COLOR[localStatus] || '#e2e8f0') : '#64748b',
            fontSize: '0.78rem', cursor: 'pointer', fontWeight: localStatus ? 600 : 400,
          }}
        >
          <option value="">— Set hiring status —</option>
          {HIRING_STATUSES.map(h => (
            <option key={h.value} value={h.value}>{h.label}</option>
          ))}
        </select>
      </div>

      {/* Show reason input only for rejected */}
      {localStatus === 'rejected' && (
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <input
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Reason for rejection…"
            style={{
              flex: 1, background: '#111827', border: '1px solid rgba(239,68,68,0.4)',
              borderRadius: '0.5rem', padding: '0.35rem 0.6rem', color: '#fca5a5',
              fontSize: '0.78rem', outline: 'none',
            }}
          />
          <button
            onClick={() => onSave(c.id, 'rejected', reason)}
            style={{
              padding: '0.35rem 0.75rem', borderRadius: '0.5rem',
              background: '#ef444420', color: '#ef4444', fontSize: '0.75rem',
              fontWeight: 600, cursor: 'pointer', border: '1px solid #ef444440',
            } as React.CSSProperties}
          >
            Save
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Candidate Card ───────────────────────────────────────────────────────────

function CandidateCard({ c, canUpdatePipeline, canUpdateHiring, onPipelineChange, onHiringChange }: {
  c: Candidate;
  canUpdatePipeline: boolean;
  canUpdateHiring: boolean;
  onPipelineChange: (id: string, status: string) => void;
  onHiringChange: (id: string, hiring_status: string, rejection_reason?: string) => void;
}) {
  const initials = ((c.name || c.email || c.resume_file_name || '?').slice(0, 2)).toUpperCase();
  const topSkills = (c.matched_skills || []).slice(0, 4);

  return (
    <div
      style={{
        background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem',
        padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem',
        transition: 'border-color 0.2s, box-shadow 0.2s',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(99,102,241,0.4)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 24px rgba(99,102,241,0.06)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = '#1e2d4a';
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', gap: '0.875rem', alignItems: 'flex-start' }}>
        <div style={{
          width: '42px', height: '42px', borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: '0.875rem', fontWeight: 700,
        }}>
          {initials}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
            <Link href={`/dashboard/candidates/${c.id}`} style={{ textDecoration: 'none' }}>
              <p style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>
                {c.name || '(Name pending)'}
              </p>
            </Link>
            <ScorePill score={c.score} status={c.score_status} />
          </div>
          {c.email && <p style={{ color: '#64748b', fontSize: '0.72rem', marginTop: '0.1rem' }}>{c.email}</p>}
          <div style={{ marginTop: '0.25rem' }}>
            {c.processing_status === 'pending' && <span style={{ fontSize: '0.68rem', color: '#64748b' }}>⏳ Pending</span>}
            {c.processing_status === 'processing' && <span style={{ fontSize: '0.68rem', color: '#6366f1' }}>⚡ Scoring…</span>}
            {c.processing_status === 'failed' && <span style={{ fontSize: '0.68rem', color: '#ef4444' }}>⚠ Failed</span>}
          </div>
        </div>
      </div>

      {/* Skills */}
      {topSkills.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
          {topSkills.map(s => <SkillChip key={s} label={s} />)}
          {(c.matched_skills || []).length > 4 && (
            <span style={{ color: '#475569', fontSize: '0.68rem', alignSelf: 'center' }}>+{c.matched_skills.length - 4} more</span>
          )}
        </div>
      )}

      {/* Summary */}
      {c.summary && (
        <p style={{ color: '#64748b', fontSize: '0.75rem', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {c.summary}
        </p>
      )}

      {/* Pipeline + Recruiter + Date row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
        <PipelineBadge status={c.status} />
        {c.hiring_status && <HiringBadge status={c.hiring_status} />}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {c.recruiter_name && <span style={{ color: '#475569', fontSize: '0.68rem' }}>👤 {c.recruiter_name}</span>}
          <span style={{ color: '#475569', fontSize: '0.68rem' }}>🗓 {new Date(c.created_at).toLocaleDateString()}</span>
        </div>
      </div>

      {/* Actions: View Profile + Pipeline dropdown */}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <Link
          href={`/dashboard/candidates/${c.id}`}
          style={{ flex: 1, textAlign: 'center', padding: '0.4rem', borderRadius: '0.5rem', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', color: '#a5b4fc', fontSize: '0.78rem', fontWeight: 600, textDecoration: 'none' }}
        >
          View Profile →
        </Link>
        {canUpdatePipeline && (
          <select
            value={c.status}
            onChange={e => onPipelineChange(c.id, e.target.value)}
            style={{ background: '#111827', border: '1px solid #1e2d4a', borderRadius: '0.5rem', padding: '0.3rem 0.5rem', color: '#94a3b8', fontSize: '0.72rem', cursor: 'pointer' }}
          >
            {PIPELINE_STATUSES.map(s => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        )}
      </div>

      {/* Hiring Status editor (recruiter + TL) */}
      {canUpdateHiring && (
        <HiringStatusEditor c={c} onSave={onHiringChange} />
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CandidatesPage() {
  const { role } = useUserContext();
  const [selectedJobId, setSelectedJobId] = useState('');
  const [scoreFilter, setScoreFilter] = useState('');
  const queryClient = useQueryClient();

  const canUpdatePipeline = role === 'admin' || role === 'manager' || role === 'tl';
  const canUpdateHiring = role === 'recruiter' || role === 'tl' || role === 'manager' || role === 'admin';

  const { data: jobsData } = useQuery({ queryKey: ['jobs'], queryFn: () => jobsApi.list() });
  const jobs = jobsData?.jobs ?? [];

  const { data, isLoading } = useQuery({
    queryKey: ['candidates', selectedJobId, scoreFilter],
    queryFn: () => candidatesApi.list(selectedJobId, scoreFilter ? { status: scoreFilter } : {}),
    enabled: !!selectedJobId,
  });
  const candidates = data?.candidates ?? [];

  const pipelineMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => candidatesApi.updateStatus(id, status),
    onSuccess: () => {
      toast.success('Pipeline status updated');
      queryClient.invalidateQueries({ queryKey: ['candidates', selectedJobId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hiringMutation = useMutation({
    mutationFn: ({ id, hiring_status, rejection_reason }: { id: string; hiring_status: string; rejection_reason?: string }) =>
      candidatesApi.updateHiringStatus(id, hiring_status, rejection_reason),
    onSuccess: (_, vars) => {
      toast.success(`Hiring status set to "${HIRING_STATUSES.find(h => h.value === vars.hiring_status)?.label}"`);
      queryClient.invalidateQueries({ queryKey: ['candidates', selectedJobId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div style={{ padding: '2rem', maxWidth: '1300px' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: '#e2e8f0' }}>📋 My Candidates</h1>
        <p style={{ color: '#64748b', marginTop: '0.25rem', fontSize: '0.875rem' }}>
          {role === 'admin' || role === 'manager' ? 'Candidate pipeline across jobs' : 'Candidates you personally uploaded'}
        </p>
      </div>

      {/* Filters bar */}
      <div style={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem', padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 220px' }}>
          <label style={{ color: '#64748b', fontSize: '0.72rem', display: 'block', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Select Job</label>
          <select value={selectedJobId} onChange={e => setSelectedJobId(e.target.value)}
            style={{ width: '100%', background: '#111827', border: '1px solid #1e2d4a', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', color: '#e2e8f0', fontSize: '0.875rem' }}>
            <option value="">— Pick a job —</option>
            {jobs.map(j => (
              <option key={j.id} value={j.id}>{j.job_title} — {j.company_name}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {SCORE_FILTERS.map(f => (
            <button key={f.value} onClick={() => setScoreFilter(f.value)}
              style={{
                padding: '0.35rem 0.8rem', borderRadius: '999px', border: '1px solid', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 500, transition: 'all 0.15s',
                background: scoreFilter === f.value ? '#6366f1' : 'transparent',
                color: scoreFilter === f.value ? '#fff' : (f.color || '#64748b'),
                borderColor: scoreFilter === f.value ? '#6366f1' : '#1e2d4a',
              }}>
              {f.label}
            </button>
          ))}
        </div>
        {selectedJobId && !isLoading && (
          <span style={{ marginLeft: 'auto', color: '#475569', fontSize: '0.78rem' }}>
            {candidates.length} candidate{candidates.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* States */}
      {!selectedJobId ? (
        <div style={{ padding: '5rem', textAlign: 'center', background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>👥</div>
          <p style={{ color: '#94a3b8', fontWeight: 500 }}>Select a job to view candidates</p>
        </div>
      ) : isLoading ? (
        <div style={{ padding: '4rem', textAlign: 'center', color: '#64748b' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⏳</div>
          <p>Loading candidates…</p>
        </div>
      ) : candidates.length === 0 ? (
        <div style={{ padding: '4rem', textAlign: 'center', background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📄</div>
          <p style={{ color: '#94a3b8', fontWeight: 500 }}>No candidates found</p>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '0.5rem' }}>
            {role === 'recruiter' || role === 'tl' ? (
              <Link href={`/dashboard/jobs/${selectedJobId}`} style={{ color: '#6366f1', textDecoration: 'none' }}>Upload resumes for this job →</Link>
            ) : 'No candidates match the current filter.'}
          </p>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 500 }}>
              {candidates.length} candidate{candidates.length !== 1 ? 's' : ''}
            </span>
            <Link href={`/dashboard/jobs/${selectedJobId}`} style={{ color: '#6366f1', fontSize: '0.8rem', textDecoration: 'none' }}>View Job →</Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: '1rem' }}>
            {candidates.map((c: Candidate) => (
              <CandidateCard
                key={c.id}
                c={c}
                canUpdatePipeline={canUpdatePipeline}
                canUpdateHiring={canUpdateHiring}
                onPipelineChange={(id, status) => pipelineMutation.mutate({ id, status })}
                onHiringChange={(id, hiring_status, rejection_reason) =>
                  hiringMutation.mutate({ id, hiring_status, rejection_reason })
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
