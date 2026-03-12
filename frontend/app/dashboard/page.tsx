'use client';

import { useQuery } from '@tanstack/react-query';
import { jobsApi } from '@/lib/api';
import Link from 'next/link';

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => jobsApi.list(),
  });

  const jobs = data?.jobs ?? [];
  const totalCandidates = jobs.reduce((sum, j) => sum + (j.candidate_count || 0), 0);
  const activeJobs = jobs.filter(j => j.status === 'active').length;

  const statCards = [
    { label: 'Total Jobs', value: jobs.length, icon: '💼', color: '#6366f1' },
    { label: 'Active Jobs', value: activeJobs, icon: '✅', color: '#22c55e' },
    { label: 'Total Candidates', value: totalCandidates, icon: '👥', color: '#f59e0b' },
    { label: 'AI Scorings Done', value: totalCandidates, icon: '🤖', color: '#8b5cf6' },
  ];

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#e2e8f0' }}>Dashboard</h1>
        <p style={{ color: '#64748b', marginTop: '0.25rem' }}>Overview of your screening workspace</p>
      </div>

      {/* Stats */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2.5rem',
      }}>
        {statCards.map(s => (
          <div key={s.label} style={{
            background: '#0d1526', border: '1px solid #1e2d4a',
            borderRadius: '1rem', padding: '1.25rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ color: '#64748b', fontSize: '0.8rem', marginBottom: '0.5rem' }}>{s.label}</p>
                <p style={{ fontSize: '2rem', fontWeight: 700, color: s.color }}>
                  {isLoading ? '—' : s.value}
                </p>
              </div>
              <span style={{ fontSize: '1.5rem' }}>{s.icon}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
        <Link href="/dashboard/jobs/new" style={{
          padding: '0.75rem 1.5rem', borderRadius: '0.625rem',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          color: '#fff', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 600,
          boxShadow: '0 0 20px rgba(99,102,241,0.3)',
        }}>+ Create New Job</Link>
        <Link href="/dashboard/jobs" style={{
          padding: '0.75rem 1.5rem', borderRadius: '0.625rem',
          border: '1px solid #1e2d4a', color: '#94a3b8', textDecoration: 'none',
          fontSize: '0.875rem', background: '#0d1526',
        }}>View All Jobs</Link>
      </div>

      {/* Recent Jobs */}
      <div style={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem', overflow: 'hidden' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #1e2d4a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '1rem' }}>Recent Jobs</h2>
          <Link href="/dashboard/jobs" style={{ color: '#6366f1', fontSize: '0.8rem', textDecoration: 'none' }}>View all →</Link>
        </div>
        {isLoading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading...</div>
        ) : jobs.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>💼</div>
            <p style={{ color: '#94a3b8', fontWeight: 500 }}>No jobs yet</p>
            <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.5rem' }}>Create your first job to start screening candidates</p>
            <Link href="/dashboard/jobs/new" style={{
              padding: '0.625rem 1.25rem', borderRadius: '0.5rem',
              background: '#6366f1', color: '#fff', textDecoration: 'none', fontSize: '0.875rem',
            }}>+ Create Job</Link>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(30,45,74,0.3)' }}>
                {['Job Title', 'Company', 'Status', 'Candidates', 'Created', 'Action'].map(h => (
                  <th key={h} style={{ padding: '0.75rem 1.5rem', textAlign: 'left', color: '#64748b', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobs.slice(0, 5).map(job => (
                <tr key={job.id} style={{ borderTop: '1px solid #1e2d4a', transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(99,102,241,0.04)'}
                  onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}>
                  <td style={{ padding: '1rem 1.5rem', color: '#e2e8f0', fontWeight: 500 }}>{job.job_title}</td>
                  <td style={{ padding: '1rem 1.5rem', color: '#94a3b8' }}>{job.company_name}</td>
                  <td style={{ padding: '1rem 1.5rem' }}>
                    <span style={{
                      padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600,
                      background: job.status === 'active' ? 'rgba(34,197,94,0.1)' : 'rgba(100,116,139,0.1)',
                      color: job.status === 'active' ? '#22c55e' : '#64748b',
                      border: `1px solid ${job.status === 'active' ? 'rgba(34,197,94,0.3)' : 'rgba(100,116,139,0.3)'}`,
                    }}>{job.status}</span>
                  </td>
                  <td style={{ padding: '1rem 1.5rem', color: '#94a3b8' }}>{job.candidate_count || 0}</td>
                  <td style={{ padding: '1rem 1.5rem', color: '#64748b', fontSize: '0.8rem' }}>
                    {new Date(job.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '1rem 1.5rem' }}>
                    <Link href={`/dashboard/jobs/${job.id}`} style={{ color: '#6366f1', fontSize: '0.8rem', textDecoration: 'none' }}>View →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
