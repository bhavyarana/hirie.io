'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { jobsApi, type Job } from '@/lib/api';
import { useUserContext } from '@/lib/context/UserContext';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export default function JobsListPage() {
  const { role } = useUserContext();
  const router = useRouter();
  const queryClient = useQueryClient();
  const canManage = role === 'admin' || role === 'manager';

  const { data, isLoading } = useQuery({ queryKey: ['jobs'], queryFn: () => jobsApi.list() });
  const jobs: Job[] = data?.jobs ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => jobsApi.delete(id),
    onSuccess: () => {
      toast.success('Job deleted');
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleDelete = (e: React.MouseEvent, job: Job) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm(`Delete job "${job.job_title}"? This will also delete all associated candidates.`)) {
      deleteMutation.mutate(job.id);
    }
  };

  const handleEdit = (e: React.MouseEvent, jobId: string) => {
    e.preventDefault();
    e.stopPropagation();
    router.push(`/dashboard/jobs/${jobId}/edit`);
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#e2e8f0' }}>Jobs</h1>
          <p style={{ color: '#64748b', marginTop: '0.25rem' }}>Manage your job roles and screen candidates</p>
        </div>
        {canManage && (
          <Link href="/dashboard/jobs/new" style={{
            padding: '0.75rem 1.5rem', borderRadius: '0.625rem',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff', textDecoration: 'none', fontWeight: 600, fontSize: '0.875rem',
            boxShadow: '0 0 20px rgba(99,102,241,0.3)',
          }}>+ New Job</Link>
        )}
      </div>

      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem', padding: '1.5rem', height: '160px' }} />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div style={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem', padding: '4rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💼</div>
          <h3 style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: '0.5rem' }}>No jobs created yet</h3>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            Create your first job posting and start screening candidates with AI
          </p>
          {canManage && (
            <Link href="/dashboard/jobs/new" style={{
              padding: '0.75rem 1.5rem', borderRadius: '0.625rem',
              background: '#6366f1', color: '#fff', textDecoration: 'none', fontWeight: 600,
            }}>+ Create First Job</Link>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.25rem' }}>
          {jobs.map(job => (
            <JobCard
              key={job.id}
              job={job}
              canManage={canManage}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function JobCard({
  job,
  canManage,
  onEdit,
  onDelete,
}: {
  job: Job;
  canManage: boolean;
  onEdit: (e: React.MouseEvent, id: string) => void;
  onDelete: (e: React.MouseEvent, job: Job) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Link href={`/dashboard/jobs/${job.id}`} style={{ textDecoration: 'none', display: 'block' }}>
        <div
          style={{
            background: '#0d1526',
            border: `1px solid ${hovered ? 'rgba(99,102,241,0.4)' : '#1e2d4a'}`,
            borderRadius: '1rem',
            padding: '1.5rem',
            transition: 'all 0.2s ease',
            cursor: 'pointer',
            transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
            boxShadow: hovered ? '0 8px 30px rgba(99,102,241,0.15)' : 'none',
          }}
        >
          {/* Top row: title + status + action icons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '1rem', marginBottom: '0.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {job.job_title}
              </h3>
              <p style={{ color: '#64748b', fontSize: '0.8rem' }}>{job.company_name}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: '0.75rem', flexShrink: 0 }}>
              <span style={{
                padding: '0.25rem 0.625rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 600,
                background: job.status === 'active' ? 'rgba(34,197,94,0.1)' : 'rgba(100,116,139,0.1)',
                color: job.status === 'active' ? '#22c55e' : '#64748b',
                border: `1px solid ${job.status === 'active' ? 'rgba(34,197,94,0.3)' : 'rgba(100,116,139,0.3)'}`,
              }}>{job.status}</span>

              {/* Edit & Delete icons — only for admin/manager */}
              {canManage && (
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  <button
                    onClick={e => onEdit(e, job.id)}
                    title="Edit job"
                    style={{
                      background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)',
                      borderRadius: '0.375rem', padding: '0.3rem 0.45rem', cursor: 'pointer',
                      color: '#a5b4fc', fontSize: '0.75rem', lineHeight: 1,
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.25)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.1)'; }}
                  >
                    ✏️
                  </button>
                  <button
                    onClick={e => onDelete(e, job)}
                    title="Delete job"
                    style={{
                      background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                      borderRadius: '0.375rem', padding: '0.3rem 0.45rem', cursor: 'pointer',
                      color: '#fca5a5', fontSize: '0.75rem', lineHeight: 1,
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.25)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.1)'; }}
                  >
                    🗑️
                  </button>
                </div>
              )}
            </div>
          </div>

          <p style={{
            color: '#475569', fontSize: '0.8rem', lineHeight: 1.6, marginBottom: '1rem',
            overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
          }}>
            {job.job_description_text}
          </p>

          {(job.required_skills ?? []).length > 0 && (
            <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              {(job.required_skills ?? []).slice(0, 4).map(s => (
                <span key={s} style={{
                  padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.7rem',
                  background: 'rgba(99,102,241,0.1)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.2)',
                }}>{s}</span>
              ))}
              {(job.required_skills ?? []).length > 4 && (
                <span style={{ color: '#64748b', fontSize: '0.7rem' }}>+{(job.required_skills ?? []).length - 4}</span>
              )}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.75rem', borderTop: '1px solid #1e2d4a' }}>
            <span style={{ color: '#64748b', fontSize: '0.75rem' }}>
              👥 {job.candidate_count || 0} candidates
            </span>
            <span style={{ color: '#64748b', fontSize: '0.75rem' }}>
              {new Date(job.created_at).toLocaleDateString()}
            </span>
          </div>

          {/* Team tags + creator */}
          {((job.teams ?? []).length > 0 || job.creator) && (
            <div style={{ marginTop: '0.625rem', display: 'flex', flexWrap: 'wrap', gap: '0.375rem', alignItems: 'center' }}>
              {(job.teams ?? []).map(t => (
                <span key={t.id} style={{ padding: '0.15rem 0.45rem', borderRadius: '4px', fontSize: '0.68rem', background: 'rgba(56,189,248,0.08)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.2)' }}>
                  🏢 {t.name}
                </span>
              ))}
              {job.creator && (
                <span style={{ fontSize: '0.68rem', color: '#475569', marginLeft: 'auto' }}>
                  by {job.creator.name || job.creator.email}
                </span>
              )}
            </div>
          )}
        </div>
      </Link>
    </div>
  );
}
