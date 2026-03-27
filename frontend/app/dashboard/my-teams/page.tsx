'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { teamsApi, jobsApi, type Team } from '@/lib/api';
import { useUserContext } from '@/lib/context/UserContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function MyTeamsPage() {
  const { role } = useUserContext();
  const router = useRouter();

  useEffect(() => {
    if (role && role !== 'tl') router.replace('/dashboard');
  }, [role, router]);

  const { data: teamsData, isLoading: teamsLoading } = useQuery({
    queryKey: ['my-teams'],
    queryFn: () => teamsApi.list(),
    enabled: role === 'tl',
  });

  const { data: jobsData } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => jobsApi.list(),
    enabled: role === 'tl',
  });

  const teams: Team[] = teamsData?.teams ?? [];
  const allJobs = jobsData?.jobs ?? [];

  function activeJobsForTeam(teamId: string) {
    return allJobs.filter(j =>
      j.status === 'active' &&
      ((j.teams ?? []).some((t: { id: string }) => t.id === teamId) || j.assigned_team_id === teamId)
    ).length;
  }

  if (teamsLoading) {
    return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading teams…</div>;
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '900px' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>My Teams</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', fontSize: '0.875rem' }}>
        Teams you lead. Click a team to manage members, assign jobs, and more.
      </p>

      {teams.length === 0 ? (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>👥</div>
          <p>You are not a Team Leader of any team yet.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {teams.map(team => {
            const activeJobs = activeJobsForTeam(team.id);
            const memberCount = team.member_count ?? 0;

            return (
              <div key={team.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', overflow: 'hidden', transition: 'border-color 0.2s' }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(99,102,241,0.4)'}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'}>

                <div style={{ padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {/* Left: team info */}
                  <div>
                    <h2 style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '1.05rem', marginBottom: '0.5rem' }}>🏢 {team.name}</h2>
                    <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.8rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>
                        <span style={{ color: '#6366f1', fontWeight: 600 }}>{memberCount}</span> member{memberCount !== 1 ? 's' : ''}
                      </span>
                      <span style={{ color: 'var(--text-muted)' }}>
                        <span style={{ color: '#22c55e', fontWeight: 600 }}>{activeJobs}</span> active job{activeJobs !== 1 ? 's' : ''}
                      </span>
                      {team.tl && (
                        <span style={{ color: 'var(--text-muted)' }}>
                          👤 TL: <span style={{ color: 'var(--text-secondary)' }}>{team.tl.name || team.tl.email}</span>
                        </span>
                      )}
                      {team.manager && (
                        <span style={{ color: 'var(--text-muted)' }}>
                          👤 Manager: <span style={{ color: 'var(--text-secondary)' }}>{team.manager.name || team.manager.email}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: action button */}
                  <Link href={`/dashboard/teams/${team.id}`}
                    style={{ padding: '0.5rem 1.125rem', borderRadius: '0.5rem', border: '1px solid rgba(99,102,241,0.35)', color: '#6366f1', textDecoration: 'none', fontSize: '0.8rem', fontWeight: 600, background: 'rgba(99,102,241,0.07)', whiteSpace: 'nowrap', transition: 'all 0.15s' }}>
                    Manage Team →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
