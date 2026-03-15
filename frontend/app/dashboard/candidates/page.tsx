'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { candidatesApi, jobsApi, Candidate } from '@/lib/api';
import { useUserContext } from '@/lib/context/UserContext';
import { toast } from 'sonner';
import Link from 'next/link';

const STATUS_FILTERS = [
  { label: 'All', value: '' },
  { label: 'Pass ✓', value: 'pass', color: '#22c55e' },
  { label: 'Review 👀', value: 'review', color: '#f59e0b' },
  { label: 'Fail ✗', value: 'fail', color: '#ef4444' },
  { label: 'Pending ⏳', value: 'pending', color: '#64748b' },
];

const PIPELINE_STATUSES = ['uploaded', 'scored', 'shortlisted', 'interview', 'rejected'] as const;
const PIPELINE_COLORS: Record<string, string> = {
  uploaded: '#64748b', scored: '#6366f1', shortlisted: '#22c55e', interview: '#f59e0b', rejected: '#ef4444',
};

function ScoreBadge({ score, status }: { score: number | null; status: string | null }) {
  if (score === null) return <span style={{ color: '#64748b', fontSize: '0.8rem' }}>–</span>;
  const color = status === 'pass' ? '#22c55e' : status === 'fail' ? '#ef4444' : '#f59e0b';
  return (
    <span style={{ fontSize: '0.875rem', fontWeight: 700, color }}>
      {score.toFixed(0)}
      <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 400 }}>/100</span>
    </span>
  );
}

export default function CandidatesPage() {
  const { role } = useUserContext();
  const [selectedJobId, setSelectedJobId] = useState('');
  const [scoreFilter, setScoreFilter] = useState('');
  const queryClient = useQueryClient();

  const canUpdateStatus = role === 'admin' || role === 'manager' || role === 'tl';

  const { data: jobsData } = useQuery({ queryKey: ['jobs'], queryFn: () => jobsApi.list() });
  const jobs = jobsData?.jobs ?? [];

  const { data, isLoading } = useQuery({
    queryKey: ['candidates', selectedJobId, scoreFilter],
    queryFn: () => candidatesApi.list(selectedJobId, scoreFilter ? { status: scoreFilter } : {}),
    enabled: !!selectedJobId,
  });
  const candidates = data?.candidates ?? [];

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => candidatesApi.updateStatus(id, status),
    onSuccess: () => {
      toast.success('Status updated');
      queryClient.invalidateQueries({ queryKey: ['candidates', selectedJobId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#e2e8f0' }}>Candidates</h1>
        <p style={{ color: '#64748b', marginTop: '0.25rem' }}>
          {role === 'recruiter' ? 'Candidates you uploaded' : role === 'tl' ? 'Candidates across your team\'s jobs' : 'Candidate pipeline across jobs'}
        </p>
      </div>

      {/* Job selector */}
      <div style={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem', padding: '1.25rem 1.5rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 240px' }}>
          <label style={{ color: '#64748b', fontSize: '0.75rem', display: 'block', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Select Job</label>
          <select value={selectedJobId} onChange={e => setSelectedJobId(e.target.value)}
            style={{ width: '100%', background: '#111827', border: '1px solid #1e2d4a', borderRadius: '0.5rem', padding: '0.625rem 0.75rem', color: '#e2e8f0', fontSize: '0.875rem' }}>
            <option value="">— Pick a job —</option>
            {jobs.map(j => (
              <option key={j.id} value={j.id}>{j.job_title} — {j.company_name}</option>
            ))}
          </select>
        </div>

        {/* Score filter tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {STATUS_FILTERS.map(f => (
            <button key={f.value} onClick={() => setScoreFilter(f.value)}
              style={{
                padding: '0.375rem 0.875rem', borderRadius: '999px', border: '1px solid', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500, transition: 'all 0.15s',
                background: scoreFilter === f.value ? '#6366f1' : 'transparent',
                color: scoreFilter === f.value ? '#fff' : (f.color || '#64748b'),
                borderColor: scoreFilter === f.value ? '#6366f1' : '#1e2d4a',
              }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Candidates table */}
      {!selectedJobId ? (
        <div style={{ padding: '4rem', textAlign: 'center', background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>👥</div>
          <p style={{ color: '#94a3b8', fontWeight: 500 }}>Select a job to view candidates</p>
        </div>
      ) : isLoading ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading candidates...</div>
      ) : candidates.length === 0 ? (
        <div style={{ padding: '4rem', textAlign: 'center', background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📄</div>
          <p style={{ color: '#94a3b8', fontWeight: 500 }}>No candidates found</p>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '0.5rem' }}>
            {role === 'recruiter' ? (
              <Link href={`/dashboard/jobs/${selectedJobId}`} style={{ color: '#6366f1', textDecoration: 'none' }}>Upload resumes for this job →</Link>
            ) : 'No candidates match the current filter.'}
          </p>
        </div>
      ) : (
        <div style={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #1e2d4a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '1rem' }}>
              {candidates.length} Candidate{candidates.length !== 1 ? 's' : ''}
            </h2>
            <Link href={`/dashboard/jobs/${selectedJobId}`} style={{ color: '#6366f1', fontSize: '0.8rem', textDecoration: 'none' }}>View Job →</Link>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
              <thead>
                <tr style={{ background: 'rgba(30,45,74,0.3)' }}>
                  {['Candidate', 'Recruiter', 'AI Score', 'Pipeline Status', 'Uploaded', ...(canUpdateStatus ? ['Actions'] : [])].map(h => (
                    <th key={h} style={{ padding: '0.75rem 1.25rem', textAlign: 'left', color: '#64748b', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {candidates.map((c: Candidate) => (
                  <tr key={c.id} style={{ borderTop: '1px solid #1e2d4a', transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(99,102,241,0.04)'}
                    onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}>

                    {/* Candidate name / file */}
                    <td style={{ padding: '0.875rem 1.25rem' }}>
                      <Link href={`/dashboard/candidates/${c.id}`} style={{ textDecoration: 'none' }}>
                        <p style={{ color: '#e2e8f0', fontWeight: 500, fontSize: '0.875rem', marginBottom: '0.15rem' }}>
                          {c.name || c.resume_file_name}
                        </p>
                        {c.email && <p style={{ color: '#64748b', fontSize: '0.75rem' }}>{c.email}</p>}
                      </Link>
                    </td>

                    {/* Recruiter */}
                    <td style={{ padding: '0.875rem 1.25rem', color: '#94a3b8', fontSize: '0.8rem' }}>
                      {c.recruiter_name || '—'}
                    </td>

                    {/* Score */}
                    <td style={{ padding: '0.875rem 1.25rem' }}>
                      <ScoreBadge score={c.score} status={c.score_status} />
                      {c.processing_status === 'pending' && <span style={{ fontSize: '0.7rem', color: '#64748b' }}>Pending</span>}
                      {c.processing_status === 'processing' && <span style={{ fontSize: '0.7rem', color: '#6366f1' }}>Scoring…</span>}
                      {c.processing_status === 'failed' && <span style={{ fontSize: '0.7rem', color: '#ef4444' }}>Failed</span>}
                    </td>

                    {/* Pipeline Status */}
                    <td style={{ padding: '0.875rem 1.25rem' }}>
                      <span style={{
                        padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.73rem', fontWeight: 600,
                        background: `${PIPELINE_COLORS[c.status] || '#64748b'}18`,
                        color: PIPELINE_COLORS[c.status] || '#64748b',
                        border: `1px solid ${PIPELINE_COLORS[c.status] || '#64748b'}40`,
                      }}>
                        {c.status}
                      </span>
                    </td>

                    {/* Date */}
                    <td style={{ padding: '0.875rem 1.25rem', color: '#64748b', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                      {new Date(c.created_at).toLocaleDateString()}
                    </td>

                    {/* Actions (TL/manager/admin only) */}
                    {canUpdateStatus && (
                      <td style={{ padding: '0.875rem 1.25rem' }}>
                        <select
                          value={c.status}
                          onChange={e => statusMutation.mutate({ id: c.id, status: e.target.value })}
                          style={{ background: '#111827', border: '1px solid #1e2d4a', borderRadius: '0.375rem', padding: '0.3rem 0.5rem', color: '#94a3b8', fontSize: '0.75rem', cursor: 'pointer' }}
                        >
                          {PIPELINE_STATUSES.map(s => (
                            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                          ))}
                        </select>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
