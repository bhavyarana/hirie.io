'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi, UserRecord } from '@/lib/api';
import { useUserContext } from '@/lib/context/UserContext';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

const ROLES = ['admin', 'manager', 'tl', 'recruiter'] as const;
const ROLE_COLORS: Record<string, string> = { admin: '#f59e0b', manager: '#6366f1', tl: '#22c55e', recruiter: '#38bdf8' };
const ROLE_LABELS: Record<string, string> = { admin: 'Admin', manager: 'Manager', tl: 'Team Leader', recruiter: 'Recruiter' };

function InviteUserModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('recruiter');
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => usersApi.create({ email, name, role }),
    onSuccess: (data) => {
      toast.success(`Invitation sent to ${email}`);
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem', padding: '2rem', width: '440px', maxWidth: '95vw' }}>
        <h2 style={{ color: '#e2e8f0', fontWeight: 700, marginBottom: '0.5rem' }}>Invite User</h2>
        <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.5rem' }}>An invitation email will be sent to the user.</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ color: '#94a3b8', fontSize: '0.8rem', display: 'block', marginBottom: '0.4rem' }}>Email *</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@company.com"
              style={{ width: '100%', background: '#111827', border: '1px solid #1e2d4a', borderRadius: '0.5rem', padding: '0.625rem 0.75rem', color: '#e2e8f0', fontSize: '0.875rem', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ color: '#94a3b8', fontSize: '0.8rem', display: 'block', marginBottom: '0.4rem' }}>Full Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="John Doe"
              style={{ width: '100%', background: '#111827', border: '1px solid #1e2d4a', borderRadius: '0.5rem', padding: '0.625rem 0.75rem', color: '#e2e8f0', fontSize: '0.875rem', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ color: '#94a3b8', fontSize: '0.8rem', display: 'block', marginBottom: '0.4rem' }}>Role *</label>
            <select value={role} onChange={e => setRole(e.target.value)}
              style={{ width: '100%', background: '#111827', border: '1px solid #1e2d4a', borderRadius: '0.5rem', padding: '0.625rem 0.75rem', color: '#e2e8f0', fontSize: '0.875rem' }}>
              {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '0.625rem 1.25rem', borderRadius: '0.5rem', border: '1px solid #1e2d4a', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '0.875rem' }}>Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={!email || mutation.isPending}
            style={{ padding: '0.625rem 1.5rem', borderRadius: '0.5rem', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, border: 'none', opacity: !email ? 0.6 : 1 }}>
            {mutation.isPending ? 'Sending…' : 'Send Invite'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const { role: currentRole } = useUserContext();
  const router = useRouter();
  const [showInvite, setShowInvite] = useState(false);
  const [filter, setFilter] = useState('all');
  const queryClient = useQueryClient();

  // Only admins can access this page
  const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: () => usersApi.list() });

  const changRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => usersApi.update(id, { role }),
    onSuccess: () => { toast.success('Role updated'); queryClient.invalidateQueries({ queryKey: ['users'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => usersApi.delete(id),
    onSuccess: () => { toast.success('User deleted'); queryClient.invalidateQueries({ queryKey: ['users'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (currentRole !== 'admin') {
    return <div style={{ padding: '2rem', color: '#ef4444' }}>Access denied. Admins only.</div>;
  }

  const allUsers = data?.users ?? [];
  const filtered = filter === 'all' ? allUsers : allUsers.filter(u => u.role === filter);

  const roleCounts = ROLES.reduce((acc, r) => ({ ...acc, [r]: allUsers.filter(u => u.role === r).length }), {} as Record<string, number>);

  return (
    <div style={{ padding: '2rem', maxWidth: '1100px' }}>
      {showInvite && <InviteUserModal onClose={() => setShowInvite(false)} />}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#e2e8f0' }}>Users</h1>
          <p style={{ color: '#64748b', marginTop: '0.25rem' }}>Manage platform users and roles</p>
        </div>
        <button onClick={() => setShowInvite(true)} style={{ padding: '0.75rem 1.5rem', borderRadius: '0.625rem', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, boxShadow: '0 0 20px rgba(99,102,241,0.3)' }}>
          + Invite User
        </button>
      </div>

      {/* Role stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {ROLES.map(r => (
          <div key={r} style={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '0.75rem', padding: '1rem', textAlign: 'center' }}>
            <p style={{ color: '#64748b', fontSize: '0.75rem', marginBottom: '0.25rem' }}>{ROLE_LABELS[r]}s</p>
            <p style={{ fontSize: '1.75rem', fontWeight: 700, color: ROLE_COLORS[r] }}>{roleCounts[r] ?? 0}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {['all', ...ROLES].map(r => (
          <button key={r} onClick={() => setFilter(r)}
            style={{ padding: '0.375rem 0.875rem', borderRadius: '999px', border: '1px solid', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500, transition: 'all 0.15s',
              background: filter === r ? '#6366f1' : 'transparent',
              color: filter === r ? '#fff' : '#64748b',
              borderColor: filter === r ? '#6366f1' : '#1e2d4a',
            }}>
            {r === 'all' ? 'All' : ROLE_LABELS[r]}
          </button>
        ))}
      </div>

      {/* Users table */}
      <div style={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem', overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>No users found</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(30,45,74,0.3)' }}>
                {['Name', 'Email', 'Role', 'Joined', 'Change Role', ''].map(h => (
                  <th key={h} style={{ padding: '0.75rem 1.5rem', textAlign: 'left', color: '#64748b', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((user: UserRecord) => (
                <tr key={user.id} style={{ borderTop: '1px solid #1e2d4a', transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(99,102,241,0.04)'}
                  onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}>
                  <td style={{ padding: '1rem 1.5rem', color: '#e2e8f0', fontWeight: 500 }}>{user.name || '—'}</td>
                  <td style={{ padding: '1rem 1.5rem', color: '#94a3b8', fontSize: '0.875rem' }}>{user.email}</td>
                  <td style={{ padding: '1rem 1.5rem' }}>
                    <span style={{ fontSize: '0.73rem', padding: '0.2rem 0.55rem', borderRadius: '999px', background: `${ROLE_COLORS[user.role]}18`, color: ROLE_COLORS[user.role], border: `1px solid ${ROLE_COLORS[user.role]}40`, fontWeight: 600 }}>
                      {ROLE_LABELS[user.role]}
                    </span>
                  </td>
                  <td style={{ padding: '1rem 1.5rem', color: '#64748b', fontSize: '0.8rem' }}>
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '1rem 1.5rem' }}>
                    <select value={user.role}
                      onChange={e => { if (confirm(`Change ${user.email} role to ${e.target.value}?`)) changRoleMutation.mutate({ id: user.id, role: e.target.value }); }}
                      style={{ background: '#111827', border: '1px solid #1e2d4a', borderRadius: '0.375rem', padding: '0.3rem 0.5rem', color: '#94a3b8', fontSize: '0.8rem' }}>
                      {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '1rem 1.5rem' }}>
                    <button onClick={() => { if (confirm(`Delete user ${user.email}?`)) deleteMutation.mutate(user.id); }}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '0.875rem' }}
                      title="Delete user">🗑️</button>
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
