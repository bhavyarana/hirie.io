'use client';

import { useQuery } from '@tanstack/react-query';
import { jobsApi, teamsApi } from '@/lib/api';
import { useUserContext } from '@/lib/context/UserContext';
import Link from 'next/link';

const ROLE_COLORS: Record<string, string> = {
  admin: '#f59e0b', manager: '#6366f1', tl: '#22c55e', recruiter: '#38bdf8',
};

function StatCard({ label, value, icon, color, isLoading }: { label: string; value: number | string; icon: string; color: string; isLoading?: boolean }) {
  return (
    <div style={{
      background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem', padding: '1.25rem',
      transition: 'border-color 0.2s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ color: '#64748b', fontSize: '0.8rem', marginBottom: '0.5rem' }}>{label}</p>
          <p style={{ fontSize: '2rem', fontWeight: 700, color }}>
            {isLoading ? '—' : value}
          </p>
        </div>
        <span style={{ fontSize: '1.5rem' }}>{icon}</span>
      </div>
    </div>
  );
}

// ─── Admin Dashboard ────────────────────────────────────────────────────────
function AdminDashboard() {
  const { data: overview, isLoading } = useQuery({
    queryKey: ['jobs-overview'],
    queryFn: () => jobsApi.overview(),
  });
  const { data: teamsData, isLoading: teamsLoading } = useQuery({
    queryKey: ['teams'],
    queryFn: () => teamsApi.list(),
  });
  const { data: jobsData, isLoading: jobsLoading } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => jobsApi.list(),
  });

  const jobs = jobsData?.jobs ?? [];
  const teams = teamsData?.teams ?? [];

  return (
    <>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#e2e8f0' }}>Admin Dashboard</h1>
        <p style={{ color: '#64748b', marginTop: '0.25rem' }}>Full platform overview</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2.5rem' }}>
        <StatCard label="Total Teams" value={overview?.total_teams ?? teams.length} icon="🏢" color="#f59e0b" isLoading={isLoading || teamsLoading} />
        <StatCard label="Total Jobs" value={overview?.total_jobs ?? jobs.length} icon="💼" color="#6366f1" isLoading={isLoading || jobsLoading} />
        <StatCard label="Active Jobs" value={overview?.active_jobs ?? 0} icon="✅" color="#22c55e" isLoading={isLoading} />
        <StatCard label="Total Candidates" value={overview?.total_candidates ?? 0} icon="👥" color="#ec4899" isLoading={isLoading} />
        <StatCard label="Total Users" value={overview?.total_users ?? 0} icon="👤" color="#38bdf8" isLoading={isLoading} />
      </div>

      {/* Quick actions */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        <Link href="/dashboard/users" style={{ padding: '0.75rem 1.5rem', borderRadius: '0.625rem', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 600 }}>+ Manage Users</Link>
        <Link href="/dashboard/teams" style={{ padding: '0.75rem 1.5rem', borderRadius: '0.625rem', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 600 }}>🏢 Manage Teams</Link>
        <Link href="/dashboard/jobs/new" style={{ padding: '0.75rem 1.5rem', borderRadius: '0.625rem', border: '1px solid #1e2d4a', color: '#94a3b8', textDecoration: 'none', fontSize: '0.875rem' }}>+ Create Job</Link>
      </div>

      {/* Teams table */}
      <div style={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem', overflow: 'hidden', marginBottom: '1.5rem' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #1e2d4a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '1rem' }}>Teams</h2>
          <Link href="/dashboard/teams" style={{ color: '#6366f1', fontSize: '0.8rem', textDecoration: 'none' }}>View all →</Link>
        </div>
        {teamsLoading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading...</div>
        ) : teams.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>No teams yet</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(30,45,74,0.3)' }}>
                {['Team', 'Manager', 'TL', 'Members', ''].map(h => (
                  <th key={h} style={{ padding: '0.75rem 1.5rem', textAlign: 'left', color: '#64748b', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teams.slice(0, 5).map(team => (
                <tr key={team.id} style={{ borderTop: '1px solid #1e2d4a' }}>
                  <td style={{ padding: '1rem 1.5rem', color: '#e2e8f0', fontWeight: 500 }}>{team.name}</td>
                  <td style={{ padding: '1rem 1.5rem', color: '#94a3b8', fontSize: '0.875rem' }}>{team.manager?.name || team.manager?.email || '—'}</td>
                  <td style={{ padding: '1rem 1.5rem', color: '#94a3b8', fontSize: '0.875rem' }}>{team.tl?.name || team.tl?.email || '—'}</td>
                  <td style={{ padding: '1rem 1.5rem', color: '#94a3b8' }}>{team.member_count ?? 0}</td>
                  <td style={{ padding: '1rem 1.5rem' }}>
                    <Link href={`/dashboard/teams/${team.id}`} style={{ color: '#6366f1', fontSize: '0.8rem', textDecoration: 'none' }}>View →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <RecentJobsTable isLoading={jobsLoading} jobs={jobs} />
    </>
  );
}

// ─── Manager Dashboard ──────────────────────────────────────────────────────
function ManagerDashboard() {
  const { data: jobsData, isLoading: jobsLoading } = useQuery({ queryKey: ['jobs'], queryFn: () => jobsApi.list() });
  const { data: teamsData, isLoading: teamsLoading } = useQuery({ queryKey: ['teams'], queryFn: () => teamsApi.list() });

  const jobs = jobsData?.jobs ?? [];
  const teams = teamsData?.teams ?? [];
  const totalCandidates = jobs.reduce((s, j) => s + (j.candidate_count || 0), 0);
  const activeJobs = jobs.filter(j => j.status === 'active').length;

  return (
    <>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#e2e8f0' }}>Manager Dashboard</h1>
        <p style={{ color: '#64748b', marginTop: '0.25rem' }}>Your teams and jobs at a glance</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2.5rem' }}>
        <StatCard label="My Teams" value={teams.length} icon="🏢" color="#6366f1" isLoading={teamsLoading} />
        <StatCard label="Total Jobs" value={jobs.length} icon="💼" color="#8b5cf6" isLoading={jobsLoading} />
        <StatCard label="Active Jobs" value={activeJobs} icon="✅" color="#22c55e" isLoading={jobsLoading} />
        <StatCard label="Total Candidates" value={totalCandidates} icon="👥" color="#f59e0b" isLoading={jobsLoading} />
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        <Link href="/dashboard/jobs/new" style={{ padding: '0.75rem 1.5rem', borderRadius: '0.625rem', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 600, boxShadow: '0 0 20px rgba(99,102,241,0.3)' }}>+ Create Job</Link>
        <Link href="/dashboard/teams" style={{ padding: '0.75rem 1.5rem', borderRadius: '0.625rem', border: '1px solid #1e2d4a', color: '#94a3b8', textDecoration: 'none', fontSize: '0.875rem' }}>🏢 Manage Teams</Link>
      </div>

      <RecentJobsTable isLoading={jobsLoading} jobs={jobs} />
    </>
  );
}

// ─── TL Dashboard ───────────────────────────────────────────────────────────
function TLDashboard() {
  const { data: jobsData, isLoading } = useQuery({ queryKey: ['jobs'], queryFn: () => jobsApi.list() });
  const jobs = jobsData?.jobs ?? [];
  const totalCandidates = jobs.reduce((s, j) => s + (j.candidate_count || 0), 0);

  return (
    <>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#e2e8f0' }}>Team Lead Dashboard</h1>
        <p style={{ color: '#64748b', marginTop: '0.25rem' }}>Monitor your team's candidate pipeline</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2.5rem' }}>
        <StatCard label="Team Jobs" value={jobs.length} icon="💼" color="#22c55e" isLoading={isLoading} />
        <StatCard label="Total Candidates" value={totalCandidates} icon="👥" color="#f59e0b" isLoading={isLoading} />
        <StatCard label="Active Jobs" value={jobs.filter(j => j.status === 'active').length} icon="✅" color="#6366f1" isLoading={isLoading} />
      </div>

      <RecentJobsTable isLoading={isLoading} jobs={jobs} />
    </>
  );
}

// ─── Recruiter Dashboard ────────────────────────────────────────────────────
function RecruiterDashboard() {
  const { user } = useUserContext();
  const { data: jobsData, isLoading } = useQuery({ queryKey: ['jobs'], queryFn: () => jobsApi.list() });
  const jobs = jobsData?.jobs ?? [];
  const totalCandidates = jobs.reduce((s, j) => s + (j.candidate_count || 0), 0);

  return (
    <>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#e2e8f0' }}>
          Welcome, {user?.name || 'Recruiter'} 👋
        </h1>
        <p style={{ color: '#64748b', marginTop: '0.25rem' }}>Your assigned jobs and candidates</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2.5rem' }}>
        <StatCard label="Assigned Jobs" value={jobs.length} icon="💼" color="#38bdf8" isLoading={isLoading} />
        <StatCard label="My Candidates" value={totalCandidates} icon="👥" color="#a78bfa" isLoading={isLoading} />
        <StatCard label="Active Jobs" value={jobs.filter(j => j.status === 'active').length} icon="✅" color="#22c55e" isLoading={isLoading} />
      </div>

      <RecentJobsTable isLoading={isLoading} jobs={jobs} showCreateBtn={false} />
    </>
  );
}

// ─── Shared Recent Jobs Table ────────────────────────────────────────────────
function RecentJobsTable({ isLoading, jobs, showCreateBtn = true }: { isLoading: boolean; jobs: any[]; showCreateBtn?: boolean }) {
  return (
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
          {showCreateBtn && (
            <Link href="/dashboard/jobs/new" style={{ display: 'inline-block', marginTop: '1rem', padding: '0.625rem 1.25rem', borderRadius: '0.5rem', background: '#6366f1', color: '#fff', textDecoration: 'none', fontSize: '0.875rem' }}>+ Create Job</Link>
          )}
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'rgba(30,45,74,0.3)' }}>
              {['Job Title', 'Company', 'Team', 'Status', 'Candidates', 'Created', ''].map(h => (
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
                <td style={{ padding: '1rem 1.5rem', color: '#94a3b8', fontSize: '0.8rem' }}>{job.team?.name || '—'}</td>
                <td style={{ padding: '1rem 1.5rem' }}>
                  <span style={{
                    padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600,
                    background: job.status === 'active' ? 'rgba(34,197,94,0.1)' : 'rgba(100,116,139,0.1)',
                    color: job.status === 'active' ? '#22c55e' : '#64748b',
                    border: `1px solid ${job.status === 'active' ? 'rgba(34,197,94,0.3)' : 'rgba(100,116,139,0.3)'}`,
                  }}>{job.status}</span>
                </td>
                <td style={{ padding: '1rem 1.5rem', color: '#94a3b8' }}>{job.candidate_count || 0}</td>
                <td style={{ padding: '1rem 1.5rem', color: '#64748b', fontSize: '0.8rem' }}>{new Date(job.created_at).toLocaleDateString()}</td>
                <td style={{ padding: '1rem 1.5rem' }}>
                  <Link href={`/dashboard/jobs/${job.id}`} style={{ color: '#6366f1', fontSize: '0.8rem', textDecoration: 'none' }}>View →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { role, loading } = useUserContext();

  if (loading) {
    return (
      <div style={{ padding: '2rem', maxWidth: '1200px' }}>
        <div style={{ color: '#64748b' }}>Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px' }}>
      {role === 'admin' && <AdminDashboard />}
      {role === 'manager' && <ManagerDashboard />}
      {role === 'tl' && <TLDashboard />}
      {role === 'recruiter' && <RecruiterDashboard />}
    </div>
  );
}
