'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { teamsApi, usersApi, Team, UserRecord } from '@/lib/api';
import { useUserContext } from '@/lib/context/UserContext';
import { toast } from 'sonner';
import Link from 'next/link';

function CreateTeamModal({ onClose, managers, tls }: { onClose: () => void; managers: UserRecord[]; tls: UserRecord[] }) {
  const [name, setName] = useState('');
  const [managerId, setManagerId] = useState('');
  const [tlId, setTlId] = useState('');
  const queryClient = useQueryClient();
  const { role, user } = useUserContext();

  const mutation = useMutation({
    mutationFn: () => teamsApi.create({ name, manager_id: managerId || undefined, tl_id: tlId || undefined }),
    onSuccess: () => {
      toast.success('Team created!');
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem', padding: '2rem', width: '440px', maxWidth: '95vw' }}>
        <h2 style={{ color: '#e2e8f0', fontWeight: 700, marginBottom: '1.5rem' }}>Create Team</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ color: '#94a3b8', fontSize: '0.8rem', display: 'block', marginBottom: '0.4rem' }}>Team Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Frontend Hiring Team"
              style={{ width: '100%', background: '#111827', border: '1px solid #1e2d4a', borderRadius: '0.5rem', padding: '0.625rem 0.75rem', color: '#e2e8f0', fontSize: '0.875rem', boxSizing: 'border-box' }} />
          </div>
          {role === 'admin' && (
            <div>
              <label style={{ color: '#94a3b8', fontSize: '0.8rem', display: 'block', marginBottom: '0.4rem' }}>Manager</label>
              <select value={managerId} onChange={e => setManagerId(e.target.value)}
                style={{ width: '100%', background: '#111827', border: '1px solid #1e2d4a', borderRadius: '0.5rem', padding: '0.625rem 0.75rem', color: '#e2e8f0', fontSize: '0.875rem' }}>
                <option value="">— Select Manager —</option>
                {managers.map(m => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
              </select>
            </div>
          )}
          <div>
            <label style={{ color: '#94a3b8', fontSize: '0.8rem', display: 'block', marginBottom: '0.4rem' }}>Team Leader</label>
            <select value={tlId} onChange={e => setTlId(e.target.value)}
              style={{ width: '100%', background: '#111827', border: '1px solid #1e2d4a', borderRadius: '0.5rem', padding: '0.625rem 0.75rem', color: '#e2e8f0', fontSize: '0.875rem' }}>
              <option value="">— Select TL —</option>
              {tls.map(t => <option key={t.id} value={t.id}>{t.name || t.email}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '0.625rem 1.25rem', borderRadius: '0.5rem', border: '1px solid #1e2d4a', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '0.875rem' }}>Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={!name || mutation.isPending}
            style={{ padding: '0.625rem 1.5rem', borderRadius: '0.5rem', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, border: 'none', opacity: !name ? 0.6 : 1 }}>
            {mutation.isPending ? 'Creating…' : 'Create Team'}
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
      {showCreate && <CreateTeamModal onClose={() => setShowCreate(false)} managers={managers} tls={tls} />}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#e2e8f0' }}>Teams</h1>
          <p style={{ color: '#64748b', marginTop: '0.25rem' }}>Manage your hiring teams</p>
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
          <p style={{ color: '#94a3b8', fontWeight: 500 }}>No teams yet</p>
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
                  <h3 style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: '0.25rem' }}>{team.name}</h3>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '999px', background: 'rgba(99,102,241,0.1)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.2)' }}>
                      {team.member_count ?? 0} members
                    </span>
                  </div>
                </div>
                {canCreate && (
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
                  <span style={{ color: '#94a3b8' }}>{team.tl?.name || team.tl?.email || '—'}</span>
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
