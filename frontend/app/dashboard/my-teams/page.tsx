'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { teamsApi, jobsApi, jobAssignmentsApi, type Job, type JobAssignment } from '@/lib/api';
import { useUserContext } from '@/lib/context/UserContext';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

type TeamMember = {
  id: string;
  user: { id: string; name: string | null; email: string; role: string };
  role_in_team: string;
};

type TeamDetail = {
  id: string;
  name: string;
  members: TeamMember[];
};

export default function MyTeamsPage() {
  const { role, user } = useUserContext();
  const router = useRouter();

  useEffect(() => {
    if (role && role !== 'tl') router.replace('/dashboard');
  }, [role, router]);

  const { data: teamsData, isLoading } = useQuery({
    queryKey: ['my-teams'],
    queryFn: () => teamsApi.list(),
    enabled: role === 'tl',
  });

  const { data: jobsData } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => jobsApi.list(),
    enabled: role === 'tl',
  });

  const { data: assignmentsData, refetch: refetchAssignments } = useQuery({
    queryKey: ['job-assignments'],
    queryFn: () => jobAssignmentsApi.list(),
    enabled: role === 'tl',
  });

  const teams: TeamDetail[] = (teamsData?.teams ?? []) as unknown as TeamDetail[];
  const allJobs: Job[] = jobsData?.jobs ?? [];
  const allAssignments: JobAssignment[] = assignmentsData?.assignments ?? [];

  if (isLoading) {
    return <div style={{ padding: '2rem', color: '#64748b' }}>Loading teams…</div>;
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '900px' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.25rem' }}>My Teams</h1>
      <p style={{ color: '#64748b', marginBottom: '2rem', fontSize: '0.875rem' }}>
        Assign jobs to your recruiters. One recruiter can handle multiple jobs.
      </p>

      {teams.length === 0 ? (
        <div style={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem', padding: '3rem', textAlign: 'center', color: '#64748b' }}>
          You are not a Team Leader of any team yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {teams.map(team => {
            const teamJobs = allJobs.filter(j =>
              (j.teams ?? []).some(t => t.id === team.id) || j.assigned_team_id === team.id
            ).filter(j => j.status === 'active');

            const recruiters = (team.members ?? []).filter(m => m.role_in_team === 'recruiter');

            return (
              <div key={team.id} style={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem', overflow: 'hidden' }}>
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #1e2d4a', background: 'rgba(99,102,241,0.04)' }}>
                  <h2 style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '1.05rem' }}>🏢 {team.name}</h2>
                  <p style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                    {recruiters.length} recruiter{recruiters.length !== 1 ? 's' : ''} · {teamJobs.length} active job{teamJobs.length !== 1 ? 's' : ''}
                  </p>
                </div>

                {recruiters.length === 0 ? (
                  <div style={{ padding: '1.5rem', color: '#475569', fontSize: '0.875rem' }}>No recruiters in this team yet.</div>
                ) : (
                  <div style={{ padding: '1rem' }}>
                    {recruiters.map(member => {
                      const recruiterAssignments = allAssignments.filter(a => a.recruiter_id === member.user.id);
                      return (
                        <RecruiterRow
                          key={member.user.id}
                          recruiter={member.user}
                          teamJobs={teamJobs}
                          assignments={recruiterAssignments}
                          onRefetch={refetchAssignments}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RecruiterRow({
  recruiter,
  teamJobs,
  assignments,
  onRefetch,
}: {
  recruiter: { id: string; name: string | null; email: string };
  teamJobs: Job[];
  assignments: JobAssignment[];
  onRefetch: () => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set(assignments.map(a => a.job_id)));
  const [saving, setSaving] = useState(false);

  // Keep selected in sync when assignments load
  useEffect(() => {
    setSelectedJobs(new Set(assignments.map(a => a.job_id)));
  }, [assignments]);

  async function handleSave() {
    setSaving(true);
    try {
      await jobAssignmentsApi.bulkAssign(recruiter.id, Array.from(selectedJobs));
      toast.success(`Jobs updated for ${recruiter.name || recruiter.email}`);
      onRefetch();
      setShowPicker(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save assignments');
    } finally {
      setSaving(false);
    }
  }

  function toggleJob(jobId: string) {
    setSelectedJobs(prev => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId); else next.add(jobId);
      return next;
    });
  }

  const assignedJobs = teamJobs.filter(j => assignments.some(a => a.job_id === j.id));

  return (
    <div style={{ padding: '1rem', borderRadius: '0.75rem', border: '1px solid #1e2d4a', marginBottom: '0.75rem', background: '#0a0f1e' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div>
          <p style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '0.9rem' }}>{recruiter.name || recruiter.email}</p>
          <p style={{ color: '#64748b', fontSize: '0.75rem' }}>{recruiter.email}</p>
        </div>
        <button
          onClick={() => { setShowPicker(p => !p); setSelectedJobs(new Set(assignments.map(a => a.job_id))); }}
          style={{ padding: '0.4rem 0.875rem', borderRadius: '0.5rem', background: showPicker ? 'rgba(99,102,241,0.2)' : 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
        >
          {showPicker ? 'Cancel' : '+ Assign Jobs'}
        </button>
      </div>

      {/* Assigned job tags */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
        {assignedJobs.length === 0 && !showPicker && (
          <span style={{ color: '#475569', fontSize: '0.775rem' }}>No jobs assigned yet</span>
        )}
        {assignedJobs.map(job => (
          <span key={job.id} style={{ padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.73rem', background: 'rgba(99,102,241,0.12)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.25)' }}>
            {job.job_title}
          </span>
        ))}
      </div>

      {/* Multi-select job picker */}
      {showPicker && (
        <div style={{ marginTop: '0.875rem', background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '0.625rem', padding: '0.875rem' }}>
          <p style={{ color: '#94a3b8', fontSize: '0.78rem', marginBottom: '0.625rem' }}>Select jobs to assign (can select multiple):</p>
          {teamJobs.length === 0 ? (
            <p style={{ color: '#475569', fontSize: '0.8rem' }}>No active jobs in this team.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '220px', overflowY: 'auto' }}>
              {teamJobs.map(job => (
                <label key={job.id} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer', padding: '0.4rem 0.5rem', borderRadius: '0.375rem', background: selectedJobs.has(job.id) ? 'rgba(99,102,241,0.1)' : 'transparent', transition: 'background 0.15s' }}>
                  <input
                    type="checkbox"
                    checked={selectedJobs.has(job.id)}
                    onChange={() => toggleJob(job.id)}
                    style={{ accentColor: '#6366f1', width: '16px', height: '16px' }}
                  />
                  <span style={{ color: '#e2e8f0', fontSize: '0.825rem' }}>{job.job_title}</span>
                  <span style={{ color: '#64748b', fontSize: '0.73rem' }}>{job.company_name}</span>
                </label>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.875rem', justifyContent: 'flex-end' }}>
            <button onClick={() => setShowPicker(false)} style={{ padding: '0.45rem 0.875rem', borderRadius: '0.375rem', border: '1px solid #1e2d4a', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '0.8rem' }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{ padding: '0.45rem 1rem', borderRadius: '0.375rem', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
              {saving ? 'Saving…' : 'Save Assignments'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
