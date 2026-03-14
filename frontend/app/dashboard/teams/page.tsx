'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { teamsApi, usersApi, Team, UserRecord } from '@/lib/api';
import { useUserContext } from '@/lib/context/UserContext';
import { toast } from 'sonner';
import Link from 'next/link';

const INP: React.CSSProperties = { width: '100%', background: '#111827', border: '1px solid #1e2d4a', borderRadius: '0.5rem', padding: '0.625rem 0.75rem', color: '#e2e8f0', fontSize: '0.875rem', boxSizing: 'border-box' };
const LBL: React.CSSProperties = { color: '#94a3b8', fontSize: '0.8rem', display: 'block', marginBottom: '0.4rem' };

type MemberEntry = { userId: string; roleInTeam: 'tl' | 'recruiter'; label: string };

function CreateTeamModal({ onClose, managers, tls, allUsers }: {
  onClose: () => void;
  managers: UserRecord[];
  tls: UserRecord[];
  allUsers: UserRecord[];
}) {
  const [name, setName] = useState('');
  const [managerId, setManagerId] = useState('');
  const [tlId, setTlId] = useState('');
  const [members, setMembers] = useState<MemberEntry[]>([]);
  const [addUserId, setAddUserId] = useState('');
  const [addRole, setAddRole] = useState<'tl' | 'recruiter'>('recruiter');
  const [isCreating, setIsCreating] = useState(false);
  const queryClient = useQueryClient();
  const { role, user } = useUserContext();

  // Auto-fill manager for manager role (not editable)
  useEffect(() => {
    if (role === 'manager' && user?.id) setManagerId(user.id);
  }, [role, user]);

  // Eligible users for member addition (tl + recruiter, not already added)
  const addedIds = new Set(members.map(m => m.userId));
  const eligible = allUsers.filter(u =>
    (u.role === 'tl' || u.role === 'recruiter') && !addedIds.has(u.id)
  );

  function addMember() {
    if (!addUserId) return;
    const u = allUsers.find(x => x.id === addUserId);
    if (!u) return;
    setMembers(prev => [...prev, { userId: addUserId, roleInTeam: addRole, label: u.name || u.email }]);
    setAddUserId('');
    setAddRole('recruiter');
  }

  function removeMember(userId: string) {
    setMembers(prev => prev.filter(m => m.userId !== userId));
  }

  async function handleCreate() {
    if (!name.trim()) return;
    setIsCreating(true);
    try {
      // 1. Create the team
      const res = await teamsApi.create({ name: name.trim(), manager_id: managerId || undefined, tl_id: tlId || undefined });
      const teamId = res.team.id;

      // 2. Add each selected member (in parallel)
      const memberPromises = members.map(m =>
        teamsApi.addMember(teamId, { user_id: m.userId, role_in_team: m.roleInTeam })
          .catch(() => null) // don't fail whole creation if one member fails
      );
      await Promise.all(memberPromises);

      toast.success(`Team "${name}" created with ${members.length} member${members.length !== 1 ? 's' : ''}!`);
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to create team');
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem', padding: '2rem', width: '480px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 style={{ color: '#e2e8f0', fontWeight: 700, marginBottom: '1.5rem' }}>Create Team</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>

          {/* Team Name */}
          <div>
            <label style={LBL}>Team Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Frontend Hiring Team" style={INP} />
          </div>

          {/* Manager */}
          <div>
            <label style={LBL}>Manager</label>
            {role === 'admin' ? (
              <select value={managerId} onChange={e => setManagerId(e.target.value)} style={INP}>
                <option value="">— Select Manager —</option>
                {managers.map(m => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
              </select>
            ) : (
              <div style={{ ...INP, color: '#a5b4fc', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.25)', cursor: 'not-allowed' }}>
                {user?.name || user?.email || '—'} <span style={{ color: '#475569', fontSize: '0.75rem' }}>(you)</span>
              </div>
            )}
          </div>

          {/* Team Leader */}
          <div>
            <label style={LBL}>Team Leader</label>
            <select value={tlId} onChange={e => setTlId(e.target.value)} style={INP}>
              <option value="">— Select TL —</option>
              {tls.map(t => <option key={t.id} value={t.id}>{t.name || t.email}</option>)}
            </select>
          </div>

          {/* Members */}
          <div>
            <label style={LBL}>Add Members <span style={{ color: '#475569' }}>(optional)</span></label>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <select value={addUserId} onChange={e => setAddUserId(e.target.value)}
                style={{ ...INP, flex: 1 }}>
                <option value="">— Select user —</option>
                {eligible.map(u => (
                  <option key={u.id} value={u.id}>{u.name || u.email} ({u.role})</option>
                ))}
              </select>
              <select value={addRole} onChange={e => setAddRole(e.target.value as 'tl' | 'recruiter')}
                style={{ ...INP, width: '110px', flexShrink: 0 }}>
                <option value="recruiter">Recruiter</option>
                <option value="tl">TL</option>
              </select>
              <button type="button" onClick={addMember} disabled={!addUserId}
                style={{ padding: '0 0.875rem', borderRadius: '0.5rem', background: addUserId ? '#6366f1' : '#1e2d4a', color: addUserId ? '#fff' : '#475569', border: 'none', cursor: addUserId ? 'pointer' : 'not-allowed', fontSize: '1rem', flexShrink: 0 }}>
                +
              </button>
            </div>

            {/* Selected member chips */}
            {members.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginTop: '0.25rem' }}>
                {members.map(m => (
                  <span key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.25rem 0.625rem', borderRadius: '999px', background: m.roleInTeam === 'tl' ? 'rgba(34,197,94,0.1)' : 'rgba(56,189,248,0.1)', color: m.roleInTeam === 'tl' ? '#22c55e' : '#38bdf8', border: `1px solid ${m.roleInTeam === 'tl' ? 'rgba(34,197,94,0.3)' : 'rgba(56,189,248,0.3)'}`, fontSize: '0.75rem' }}>
                    {m.label}
                    <span style={{ opacity: 0.6, fontSize: '0.65rem' }}>({m.roleInTeam === 'tl' ? 'TL' : 'Rec.'})</span>
                    <button type="button" onClick={() => removeMember(m.userId)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'currentColor', padding: 0, lineHeight: 1, fontSize: '0.9rem', opacity: 0.7 }}>×</button>
                  </span>
                ))}
              </div>
            )}
            {members.length === 0 && (
              <p style={{ color: '#475569', fontSize: '0.75rem', marginTop: '0.25rem' }}>No members added yet — you can add them after creation too.</p>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.75rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '0.625rem 1.25rem', borderRadius: '0.5rem', border: '1px solid #1e2d4a', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '0.875rem' }}>Cancel</button>
          <button onClick={handleCreate} disabled={!name.trim() || isCreating}
            style={{ padding: '0.625rem 1.5rem', borderRadius: '0.5rem', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', cursor: (!name.trim() || isCreating) ? 'not-allowed' : 'pointer', fontSize: '0.875rem', fontWeight: 600, border: 'none', opacity: (!name.trim() || isCreating) ? 0.7 : 1 }}>
            {isCreating ? 'Creating…' : `Create Team${members.length > 0 ? ` (+${members.length})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}


export default function TeamsPage() {
  const { role } = useUserContext();
  const [showCreate, setShowCreate] = useState(false);
  const queryClient = useQueryClient();

  const { data: teamsData, isLoading } = useQuery({ queryKey: ['teams'], queryFn: () => teamsApi.list() });
  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
    enabled: role === 'admin' || role === 'manager',
  });

  const canCreate = role === 'admin' || role === 'manager';
  const teams = teamsData?.teams ?? [];
  const allUsers = usersData?.users ?? [];
  const managers = allUsers.filter(u => u.role === 'manager' || u.role === 'admin');
  const tls = allUsers.filter(u => u.role === 'tl');

  const deleteMutation = useMutation({
    mutationFn: (id: string) => teamsApi.delete(id),
    onSuccess: () => { toast.success('Team deleted'); queryClient.invalidateQueries({ queryKey: ['teams'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px' }}>
      {showCreate && <CreateTeamModal onClose={() => setShowCreate(false)} managers={managers} tls={tls} allUsers={allUsers} />}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#e2e8f0' }}>Teams</h1>
          <p style={{ color: '#64748b', marginTop: '0.25rem', fontSize: '0.875rem' }}>
            {role === 'manager' ? 'Your managed teams' : 'Manage your hiring teams'}
          </p>
        </div>
        {canCreate && (
          <button onClick={() => setShowCreate(true)} style={{ padding: '0.75rem 1.5rem', borderRadius: '0.625rem', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, boxShadow: '0 0 20px rgba(99,102,241,0.3)' }}>
            + Create Team
          </button>
        )}
      </div>

      {/* Teams Grid */}
      {isLoading ? (
        <div style={{ color: '#64748b', padding: '2rem', textAlign: 'center' }}>Loading teams...</div>
      ) : teams.length === 0 ? (
        <div style={{ padding: '4rem', textAlign: 'center', background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏢</div>
          <p style={{ color: '#94a3b8', fontWeight: 500 }}>
            {role === 'manager' ? 'You have no teams assigned yet.' : 'No teams yet'}
          </p>
          {canCreate && <button onClick={() => setShowCreate(true)} style={{ marginTop: '1rem', padding: '0.625rem 1.25rem', borderRadius: '0.5rem', background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.875rem' }}>+ Create First Team</button>}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
          {teams.map((team: Team) => (
            <div key={team.id} style={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem', padding: '1.5rem', transition: 'border-color 0.2s' }}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(99,102,241,0.4)'}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = '#1e2d4a'}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div>
                  <h3 style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: '0.375rem' }}>{team.name}</h3>
                  <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '999px', background: 'rgba(99,102,241,0.1)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.2)' }}>
                    {team.member_count ?? 0} members
                  </span>
                </div>
                {/* Delete only for admin */}
                {role === 'admin' && (
                  <button onClick={() => { if (confirm('Delete this team?')) deleteMutation.mutate(team.id); }}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b', padding: '0.25rem', fontSize: '0.875rem', borderRadius: '0.25rem' }}
                    title="Delete team">🗑️</button>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.8rem' }}>
                  <span style={{ color: '#64748b', minWidth: '60px' }}>Manager:</span>
                  <span style={{ color: '#94a3b8' }}>{team.manager?.name || team.manager?.email || '—'}</span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.8rem' }}>
                  <span style={{ color: '#64748b', minWidth: '60px' }}>TL:</span>
                  <span style={{ color: '#22c55e' }}>{team.tl?.name || team.tl?.email || '—'}</span>
                </div>
              </div>

              <Link href={`/dashboard/teams/${team.id}`} style={{
                display: 'block', textAlign: 'center', padding: '0.5rem',
                borderRadius: '0.5rem', border: '1px solid rgba(99,102,241,0.3)',
                color: '#a5b4fc', textDecoration: 'none', fontSize: '0.8rem', fontWeight: 500,
                transition: 'all 0.15s',
              }}>
                View Team →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
