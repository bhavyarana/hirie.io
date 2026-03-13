'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { teamsApi, usersApi, TeamMember, UserRecord } from '@/lib/api';
import { useUserContext } from '@/lib/context/UserContext';
import { toast } from 'sonner';
import Link from 'next/link';
import { useParams } from 'next/navigation';

const ROLE_COLORS: Record<string, string> = { admin: '#f59e0b', manager: '#6366f1', tl: '#22c55e', recruiter: '#38bdf8' };

function AddMemberModal({ teamId, existingIds, onClose, users }: { teamId: string; existingIds: string[]; onClose: () => void; users: UserRecord[] }) {
  const [userId, setUserId] = useState('');
  const [roleInTeam, setRoleInTeam] = useState<'tl' | 'recruiter'>('recruiter');
  const queryClient = useQueryClient();

  const available = users.filter(u => !existingIds.includes(u.id) && (u.role === 'recruiter' || u.role === 'tl'));

  const mutation = useMutation({
    mutationFn: () => teamsApi.addMember(teamId, { user_id: userId, role_in_team: roleInTeam }),
    onSuccess: () => {
      toast.success('Member added!');
      queryClient.invalidateQueries({ queryKey: ['team', teamId] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem', padding: '2rem', width: '400px', maxWidth: '95vw' }}>
        <h2 style={{ color: '#e2e8f0', fontWeight: 700, marginBottom: '1.5rem' }}>Add Team Member</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ color: '#94a3b8', fontSize: '0.8rem', display: 'block', marginBottom: '0.4rem' }}>User *</label>
            <select value={userId} onChange={e => setUserId(e.target.value)}
              style={{ width: '100%', background: '#111827', border: '1px solid #1e2d4a', borderRadius: '0.5rem', padding: '0.625rem 0.75rem', color: '#e2e8f0', fontSize: '0.875rem' }}>
              <option value="">— Select User —</option>
              {available.map(u => <option key={u.id} value={u.id}>{u.name || u.email} ({u.role})</option>)}
            </select>
          </div>
          <div>
            <label style={{ color: '#94a3b8', fontSize: '0.8rem', display: 'block', marginBottom: '0.4rem' }}>Role in Team</label>
            <select value={roleInTeam} onChange={e => setRoleInTeam(e.target.value as 'tl' | 'recruiter')}
              style={{ width: '100%', background: '#111827', border: '1px solid #1e2d4a', borderRadius: '0.5rem', padding: '0.625rem 0.75rem', color: '#e2e8f0', fontSize: '0.875rem' }}>
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

export default function TeamDetailPage() {
  const params = useParams();
  const teamId = params.id as string;
  const { role } = useUserContext();
  const [showAddMember, setShowAddMember] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['team', teamId], queryFn: () => teamsApi.get(teamId) });
  const { data: usersData } = useQuery({ queryKey: ['users'], queryFn: () => usersApi.list(), enabled: role === 'admin' || role === 'manager' });

  const canManage = role === 'admin' || role === 'manager';
  const team = data?.team;
  const members = team?.members ?? [];
  const allUsers = usersData?.users ?? [];

  const removeMutation = useMutation({
    mutationFn: (userId: string) => teamsApi.removeMember(teamId, userId),
    onSuccess: () => { toast.success('Member removed'); queryClient.invalidateQueries({ queryKey: ['team', teamId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div style={{ padding: '2rem', color: '#64748b' }}>Loading team...</div>;
  if (!team) return <div style={{ padding: '2rem', color: '#ef4444' }}>Team not found</div>;

  return (
    <div style={{ padding: '2rem', maxWidth: '1000px' }}>
      {showAddMember && (
        <AddMemberModal
          teamId={teamId}
          existingIds={members.map((m: TeamMember) => m.user_id)}
          onClose={() => setShowAddMember(false)}
          users={allUsers}
        />
      )}

      {/* Breadcrumb */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.875rem', color: '#64748b' }}>
        <Link href="/dashboard/teams" style={{ color: '#6366f1', textDecoration: 'none' }}>Teams</Link>
        <span>→</span>
        <span style={{ color: '#94a3b8' }}>{team.name}</span>
      </div>

      {/* Header */}
      <div style={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem', padding: '1.5rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.75rem' }}>🏢 {team.name}</h1>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.875rem' }}>
              <div>
                <span style={{ color: '#64748b' }}>Manager: </span>
                <span style={{ color: '#e2e8f0' }}>{team.manager?.name || team.manager?.email || '—'}</span>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Team Lead: </span>
                <span style={{ color: '#22c55e' }}>{team.tl?.name || team.tl?.email || '—'}</span>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Members: </span>
                <span style={{ color: '#e2e8f0' }}>{members.length}</span>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Jobs: </span>
                <span style={{ color: '#e2e8f0' }}>{team.job_count ?? 0}</span>
              </div>
            </div>
          </div>
          {canManage && (
            <button onClick={() => setShowAddMember(true)} style={{ padding: '0.625rem 1.25rem', borderRadius: '0.5rem', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 }}>
              + Add Member
            </button>
          )}
        </div>
      </div>

      {/* Members table */}
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
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '0.875rem' }}
                        title="Remove member">🗑️</button>
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
          <h2 style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '1rem' }}>Team Jobs</h2>
          <Link href="/dashboard/jobs" style={{ color: '#6366f1', fontSize: '0.8rem', textDecoration: 'none' }}>All Jobs →</Link>
        </div>
        <div style={{ padding: '1rem 1.5rem', color: '#64748b', fontSize: '0.875rem' }}>
          {team.job_count ?? 0} job(s) assigned to this team.{' '}
          <Link href={`/dashboard/jobs?team=${teamId}`} style={{ color: '#6366f1', textDecoration: 'none' }}>View jobs →</Link>
        </div>
      </div>
    </div>
  );
}
