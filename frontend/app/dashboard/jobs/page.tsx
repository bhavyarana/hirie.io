'use client';

import { useQuery } from '@tanstack/react-query';
import { jobsApi, type Job } from '@/lib/api';
import Link from 'next/link';

export default function JobsListPage() {
  const { data, isLoading } = useQuery({ queryKey: ['jobs'], queryFn: () => jobsApi.list() });
  const jobs: Job[] = data?.jobs ?? [];

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#e2e8f0' }}>Jobs</h1>
          <p style={{ color: '#64748b', marginTop: '0.25rem' }}>Manage your job roles and screen candidates</p>
        </div>
        <Link href="/dashboard/jobs/new" style={{
          padding: '0.75rem 1.5rem', borderRadius: '0.625rem',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          color: '#fff', textDecoration: 'none', fontWeight: 600, fontSize: '0.875rem',
          boxShadow: '0 0 20px rgba(99,102,241,0.3)',
        }}>+ New Job</Link>
      </div>

      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem', padding: '1.5rem', height: '160px' }} className="skeleton" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div style={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem', padding: '4rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💼</div>
          <h3 style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: '0.5rem' }}>No jobs created yet</h3>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            Create your first job posting and start screening candidates with AI
          </p>
          <Link href="/dashboard/jobs/new" style={{
            padding: '0.75rem 1.5rem', borderRadius: '0.625rem',
            background: '#6366f1', color: '#fff', textDecoration: 'none', fontWeight: 600,
          }}>+ Create First Job</Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.25rem' }}>
          {jobs.map(job => (
            <Link key={job.id} href={`/dashboard/jobs/${job.id}`} style={{ textDecoration: 'none' }}>
              <div style={{
                background: '#0d1526', border: '1px solid #1e2d4a',
                borderRadius: '1rem', padding: '1.5rem',
                transition: 'all 0.2s ease', cursor: 'pointer',
              }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(99,102,241,0.4)';
                  (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
                  (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 30px rgba(99,102,241,0.15)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = '#1e2d4a';
                  (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
                  (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <div>
                    <h3 style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '1rem', marginBottom: '0.25rem' }}>{job.job_title}</h3>
                    <p style={{ color: '#64748b', fontSize: '0.8rem' }}>{job.company_name}</p>
                  </div>
                  <span style={{
                    padding: '0.25rem 0.625rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 600,
                    background: job.status === 'active' ? 'rgba(34,197,94,0.1)' : 'rgba(100,116,139,0.1)',
                    color: job.status === 'active' ? '#22c55e' : '#64748b',
                    border: `1px solid ${job.status === 'active' ? 'rgba(34,197,94,0.3)' : 'rgba(100,116,139,0.3)'}`,
                  }}>{job.status}</span>
                </div>

                <p style={{ color: '#475569', fontSize: '0.8rem', lineHeight: 1.6, marginBottom: '1rem',
                  overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
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
                    {(job.required_skills ?? []).length > 4 && <span style={{ color: '#64748b', fontSize: '0.7rem' }}>+{(job.required_skills ?? []).length - 4}</span>}
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
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
