'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { teamsApi, jobsApi, usersApi, TeamMember, UserRecord, Job } from '@/lib/api';
import { useUserContext } from '@/lib/context/UserContext';
import { toast } from 'sonner';
import Link from 'next/link';
import { useParams } from 'next/navigation';

const ROLE_COLORS: Record<string, string> = { admin: '#f59e0b', manager: '#6366f1', tl: '#22c55e', recruiter: '#38bdf8' };
const INP: React.CSSProperties = { width: '100%', background: '#111827', border: '1px solid #1e2d4a', borderRadius: '0.5rem', padding: '0.625rem 0.75rem', color: '#e2e8f0', fontSize: '0.875rem', boxSizing: 'border-box' };
const LBL: React.CSSProperties = { color: '#94a3b8', fontSize: '0.8rem', display: 'block', marginBottom: '0.4rem' };

// ─── Add Member Modal ─────────────────────────────────────────────────────────
function AddMemberModal({ teamId, existingIds, onClose, users }: { teamId: string; existingIds: string[]; onClose: () => void; users: UserRecord[] }) {
  const [userId, setUserId] = useState('');
  const [roleInTeam, setRoleInTeam] = useState<'tl' | 'recruiter'>('recruiter');
  const queryClient = useQueryClient();
  const available = users.filter(u => !existingIds.includes(u.id) && (u.role === 'recruiter' || u.role === 'tl'));

  const mutation = useMutation({
    mutationFn: () => teamsApi.addMember(teamId, { user_id: userId, role_in_team: roleInTeam }),
    onSuccess: () => { toast.success('Member added!'); queryClient.invalidateQueries({ queryKey: ['team', teamId] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem', padding: '2rem', width: '400px', maxWidth: '95vw' }}>
        <h2 style={{ color: '#e2e8f0', fontWeight: 700, marginBottom: '1.5rem' }}>Add Team Member</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={LBL}>User *</label>
            <select value={userId} onChange={e => setUserId(e.target.value)} style={INP}>
              <option value="">— Select User —</option>
              {available.map(u => <option key={u.id} value={u.id}>{u.name || u.email} ({u.role})</option>)}
            </select>
          </div>
          <div>
            <label style={LBL}>Role in Team</label>
            <select value={roleInTeam} onChange={e => setRoleInTeam(e.target.value as 'tl' | 'recruiter')} style={INP}>
              <option value="recruiter">Recruiter</option>
              <option value="tl">Team Leader</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '0.625rem 1.25rem', borderRadius: '0.5rem', border: '1px solid #1e2d4a', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '0.875rem' }}>Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={!userId || mutation.isPending}
            style={{ padding: '0.625rem 1.5rem', borderRadius: '0.5rem', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, border: 'none', opacity: !userId ? 0.6 : 1 }}>
            {mutation.isPending ? 'Adding…' : 'Add Member'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Team Modal (Admin only) ─────────────────────────────────────────────
function EditTeamModal({ teamId, currentName, currentManagerId, currentTlId, onClose, users }: {
  teamId: string; currentName: string; currentManagerId: string | null; currentTlId: string | null;
  onClose: () => void; users: UserRecord[];
}) {
  const [name, setName] = useState(currentName);
  const [managerId, setManagerId] = useState(currentManagerId || '');
  const [tlId, setTlId] = useState(currentTlId || '');
  const queryClient = useQueryClient();

  const managers = users.filter(u => u.role === 'manager' || u.role === 'admin');
  const tls = users.filter(u => u.role === 'tl');

  const mutation = useMutation({
    mutationFn: () => teamsApi.update(teamId, { name, manager_id: managerId || undefined, tl_id: tlId || undefined }),
    onSuccess: () => {
      toast.success('Team updated!');
      queryClient.invalidateQueries({ queryKey: ['team', teamId] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem', padding: '2rem', width: '440px', maxWidth: '95vw' }}>
        <h2 style={{ color: '#e2e8f0', fontWeight: 700, marginBottom: '1.5rem' }}>Edit Team</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={LBL}>Team Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} style={INP} />
          </div>
          <div>
            <label style={LBL}>Manager</label>
            <select value={managerId} onChange={e => setManagerId(e.target.value)} style={INP}>
              <option value="">— None —</option>
              {managers.map(m => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
            </select>
          </div>
          <div>
            <label style={LBL}>Team Leader</label>
            <select value={tlId} onChange={e => setTlId(e.target.value)} style={INP}>
              <option value="">— None —</option>
              {tls.map(t => <option key={t.id} value={t.id}>{t.name || t.email}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '0.625rem 1.25rem', borderRadius: '0.5rem', border: '1px solid #1e2d4a', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '0.875rem' }}>Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={!name.trim() || mutation.isPending}
            style={{ padding: '0.625rem 1.5rem', borderRadius: '0.5rem', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, border: 'none', opacity: !name.trim() ? 0.6 : 1 }}>
            {mutation.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Assign Jobs Modal ────────────────────────────────────────────────────────
function AssignJobsModal({ teamId, currentJobIds, onClose }: { teamId: string; currentJobIds: string[]; onClose: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(currentJobIds));
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  const { data: jobsData, isLoading } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => jobsApi.list(),
  });
  const activeJobs = (jobsData?.jobs ?? []).filter(j => j.status === 'active');

  function toggle(id: string) {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function handleSave() {
    setSaving(true);
    try {
      // Jobs to add: in selected but not in current
      const toAdd = [...selected].filter(id => !currentJobIds.includes(id));
      // Jobs to remove: in current but not in selected
      const toRemove = currentJobIds.filter(id => !selected.has(id));

      if (toAdd.length > 0) await teamsApi.assignJobs(teamId, toAdd);
      for (const jobId of toRemove) await teamsApi.removeJob(teamId, jobId);

      toast.success('Team jobs updated!');
      queryClient.invalidateQueries({ queryKey: ['team', teamId] });
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to update jobs');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem', padding: '2rem', width: '520px', maxWidth: '95vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <h2 style={{ color: '#e2e8f0', fontWeight: 700, marginBottom: '0.5rem' }}>Assign Jobs to Team</h2>
        <p style={{ color: '#64748b', fontSize: '0.8rem', marginBottom: '1.25rem' }}>Check the active jobs you want this team to work on.</p>

        {isLoading ? (
          <div style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>Loading jobs…</div>
        ) : activeJobs.length === 0 ? (
          <div style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>No active jobs available.</div>
        ) : (
          <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1rem' }}>
            {activeJobs.map((job: Job) => (
              <label key={job.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', padding: '0.625rem 0.75rem', borderRadius: '0.5rem', background: selected.has(job.id) ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.02)', border: `1px solid ${selected.has(job.id) ? 'rgba(99,102,241,0.35)' : '#1e2d4a'}`, transition: 'all 0.15s' }}>
                <input type="checkbox" checked={selected.has(job.id)} onChange={() => toggle(job.id)}
                  style={{ accentColor: '#6366f1', width: '16px', height: '16px', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: '#e2e8f0', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.job_title}</p>
                  <p style={{ color: '#64748b', fontSize: '0.73rem' }}>{job.company_name}</p>
                </div>
                {selected.has(job.id) && <span style={{ color: '#6366f1', fontSize: '0.75rem', fontWeight: 600, flexShrink: 0 }}>✓ Assigned</span>}
              </label>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', borderTop: '1px solid #1e2d4a', paddingTop: '1rem' }}>
          <button onClick={onClose} style={{ padding: '0.625rem 1.25rem', borderRadius: '0.5rem', border: '1px solid #1e2d4a', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '0.875rem' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '0.625rem 1.5rem', borderRadius: '0.5rem', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '0.875rem', fontWeight: 600, border: 'none' }}>
            {saving ? 'Saving…' : `Save (${selected.size} job${selected.size !== 1 ? 's' : ''})`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TeamDetailPage() {
  const params = useParams();
  const teamId = params.id as string;
  const { role } = useUserContext();
  const [showAddMember, setShowAddMember] = useState(false);
  const [showEditTeam, setShowEditTeam] = useState(false);
  const [showAssignJobs, setShowAssignJobs] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['team', teamId], queryFn: () => teamsApi.get(teamId) });
  const { data: usersData } = useQuery({ queryKey: ['users'], queryFn: () => usersApi.list(), enabled: role === 'admin' || role === 'manager' });

  const canManage = role === 'admin' || role === 'manager';
  const isAdmin = role === 'admin';
  const team = data?.team;
  const members = team?.members ?? [];
  const teamJobs = team?.jobs ?? [];
  const allUsers = usersData?.users ?? [];

  const removeMutation = useMutation({
    mutationFn: (userId: string) => teamsApi.removeMember(teamId, userId),
    onSuccess: () => { toast.success('Member removed'); queryClient.invalidateQueries({ queryKey: ['team', teamId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div style={{ padding: '2rem', color: '#64748b' }}>Loading team...</div>;
  if (!team) return <div style={{ padding: '2rem', color: '#ef4444' }}>Team not found</div>;

  const STATUS_STYLE = (s: string): React.CSSProperties => ({
    padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 600,
    background: s === 'active' ? 'rgba(34,197,94,0.1)' : s === 'draft' ? 'rgba(100,116,139,0.1)' : 'rgba(239,68,68,0.1)',
    color: s === 'active' ? '#22c55e' : s === 'draft' ? '#64748b' : '#ef4444',
    border: `1px solid ${s === 'active' ? 'rgba(34,197,94,0.3)' : s === 'draft' ? 'rgba(100,116,139,0.3)' : 'rgba(239,68,68,0.3)'}`,
  });

  return (
    <div style={{ padding: '2rem', maxWidth: '1000px' }}>
      {/* Modals */}
      {showAddMember && (
        <AddMemberModal teamId={teamId} existingIds={members.map((m: TeamMember) => m.user_id)} onClose={() => setShowAddMember(false)} users={allUsers} />
      )}
      {showEditTeam && isAdmin && (
        <EditTeamModal
          teamId={teamId} currentName={team.name}
          currentManagerId={team.manager_id ?? null} currentTlId={team.tl_id ?? null}
          onClose={() => setShowEditTeam(false)} users={allUsers}
        />
      )}
      {showAssignJobs && (
        <AssignJobsModal teamId={teamId} currentJobIds={teamJobs.map(j => j.id)} onClose={() => setShowAssignJobs(false)} />
      )}

      {/* Breadcrumb */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.875rem', color: '#64748b' }}>
        <Link href="/dashboard/teams" style={{ color: '#6366f1', textDecoration: 'none' }}>Teams</Link>
        <span>→</span>
        <span style={{ color: '#94a3b8' }}>{team.name}</span>
      </div>

      {/* Header Card */}
      <div style={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem', padding: '1.5rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.75rem' }}>🏢 {team.name}</h1>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 1.5rem', fontSize: '0.875rem' }}>
              <div><span style={{ color: '#64748b' }}>Manager: </span><span style={{ color: '#e2e8f0' }}>{team.manager?.name || team.manager?.email || '—'}</span></div>
              <div><span style={{ color: '#64748b' }}>Team Lead: </span><span style={{ color: '#22c55e' }}>{team.tl?.name || team.tl?.email || '—'}</span></div>
              <div><span style={{ color: '#64748b' }}>Members: </span><span style={{ color: '#e2e8f0' }}>{members.length}</span></div>
              <div><span style={{ color: '#64748b' }}>Jobs: </span><span style={{ color: '#e2e8f0' }}>{team.job_count ?? 0}</span></div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap' }}>
            {isAdmin && (
              <button onClick={() => setShowEditTeam(true)} style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid rgba(99,102,241,0.4)', background: 'rgba(99,102,241,0.08)', color: '#a5b4fc', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                ✏️ Edit Team
              </button>
            )}
            {canManage && (
              <button onClick={() => setShowAddMember(true)} style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                + Add Member
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Team Members */}
      <div style={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem', overflow: 'hidden', marginBottom: '1.5rem' }}>
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #1e2d4a' }}>
          <h2 style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '1rem' }}>Team Members</h2>
        </div>
        {members.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>No members yet</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(30,45,74,0.3)' }}>
                {['Name', 'Email', 'System Role', 'Team Role', ...(canManage ? [''] : [])].map(h => (
                  <th key={h} style={{ padding: '0.75rem 1.5rem', textAlign: 'left', color: '#64748b', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((member: TeamMember) => (
                <tr key={member.id} style={{ borderTop: '1px solid #1e2d4a' }}>
                  <td style={{ padding: '1rem 1.5rem', color: '#e2e8f0', fontWeight: 500 }}>{member.user?.name || '—'}</td>
                  <td style={{ padding: '1rem 1.5rem', color: '#94a3b8', fontSize: '0.875rem' }}>{member.user?.email}</td>
                  <td style={{ padding: '1rem 1.5rem' }}>
                    <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '999px', background: `${ROLE_COLORS[member.user?.role || 'recruiter']}20`, color: ROLE_COLORS[member.user?.role || 'recruiter'], border: `1px solid ${ROLE_COLORS[member.user?.role || 'recruiter']}40` }}>
                      {member.user?.role}
                    </span>
                  </td>
                  <td style={{ padding: '1rem 1.5rem' }}>
                    <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '999px', background: member.role_in_team === 'tl' ? 'rgba(34,197,94,0.1)' : 'rgba(56,189,248,0.1)', color: member.role_in_team === 'tl' ? '#22c55e' : '#38bdf8', border: `1px solid ${member.role_in_team === 'tl' ? 'rgba(34,197,94,0.3)' : 'rgba(56,189,248,0.3)'}` }}>
                      {member.role_in_team === 'tl' ? 'Team Leader' : 'Recruiter'}
                    </span>
                  </td>
                  {canManage && (
                    <td style={{ padding: '1rem 1.5rem' }}>
                      <button onClick={() => { if (confirm('Remove this member?')) removeMutation.mutate(member.user_id); }}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '0.875rem' }} title="Remove member">🗑️</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Team Jobs */}
      <div style={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem', overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #1e2d4a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '1rem' }}>Team Jobs <span style={{ color: '#64748b', fontWeight: 400, fontSize: '0.8rem' }}>({teamJobs.length})</span></h2>
          <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'center' }}>
            <Link href="/dashboard/jobs" style={{ color: '#6366f1', fontSize: '0.8rem', textDecoration: 'none' }}>All Jobs →</Link>
            {canManage && (
              <button onClick={() => setShowAssignJobs(true)} style={{ padding: '0.375rem 0.875rem', borderRadius: '0.375rem', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.775rem', fontWeight: 600 }}>
                + Assign Jobs
              </button>
            )}
          </div>
        </div>

        {teamJobs.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: '#64748b' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>💼</div>
            <p style={{ marginBottom: '0.5rem' }}>No jobs assigned to this team yet.</p>
            {canManage && (
              <button onClick={() => setShowAssignJobs(true)} style={{ marginTop: '0.5rem', padding: '0.5rem 1rem', borderRadius: '0.5rem', background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>
                + Assign First Job
              </button>
            )}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(30,45,74,0.3)' }}>
                {['Job Title', 'Company', 'Status', 'Created', ''].map(h => (
                  <th key={h} style={{ padding: '0.75rem 1.5rem', textAlign: 'left', color: '#64748b', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teamJobs.map(job => (
                <tr key={job.id} style={{ borderTop: '1px solid #1e2d4a' }}>
                  <td style={{ padding: '0.875rem 1.5rem', color: '#e2e8f0', fontWeight: 500 }}>{job.job_title}</td>
                  <td style={{ padding: '0.875rem 1.5rem', color: '#94a3b8', fontSize: '0.875rem' }}>{job.company_name}</td>
                  <td style={{ padding: '0.875rem 1.5rem' }}><span style={STATUS_STYLE(job.status)}>{job.status}</span></td>
                  <td style={{ padding: '0.875rem 1.5rem', color: '#64748b', fontSize: '0.8rem' }}>{new Date(job.created_at).toLocaleDateString()}</td>
                  <td style={{ padding: '0.875rem 1.5rem' }}>
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
