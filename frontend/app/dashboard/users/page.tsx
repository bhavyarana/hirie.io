'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi, UserRecord } from '@/lib/api';
import { useUserContext } from '@/lib/context/UserContext';
import { toast } from 'sonner';

const ROLES = ['admin', 'manager', 'tl', 'recruiter'] as const;
const ROLE_COLORS: Record<string, string> = { admin: '#f59e0b', manager: '#6366f1', tl: '#22c55e', recruiter: '#38bdf8' };
const ROLE_LABELS: Record<string, string> = { admin: 'Admin', manager: 'Manager', tl: 'Team Leader', recruiter: 'Recruiter' };

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)',
  borderRadius: '0.5rem', padding: '0.625rem 0.75rem',
  color: 'var(--text-primary)', fontSize: '0.875rem', boxSizing: 'border-box',
};

function AddUserModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('recruiter');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => usersApi.create({ email, name, role, password }),
    onSuccess: () => { toast.success(`User ${email} added successfully`); queryClient.invalidateQueries({ queryKey: ['users'] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const isValid = email.length > 0 && password.length >= 6;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '2rem', width: '440px', maxWidth: '95vw' }}>
        <h2 style={{ color: 'var(--text-primary)', fontWeight: 700, marginBottom: '0.5rem' }}>Add User</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
          Create a new user account. They can log in immediately with the credentials you set.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', display: 'block', marginBottom: '0.4rem' }}>Email *</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@company.com" style={inputStyle} />
          </div>
          <div>
            <label style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', display: 'block', marginBottom: '0.4rem' }}>Full Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="John Doe" style={inputStyle} />
          </div>
          <div>
            <label style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', display: 'block', marginBottom: '0.4rem' }}>Role *</label>
            <select value={role} onChange={e => setRole(e.target.value)} style={inputStyle}>
              {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </div>
          <div>
            <label style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', display: 'block', marginBottom: '0.4rem' }}>Password *</label>
            <div style={{ position: 'relative' }}>
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 6 characters" style={{ ...inputStyle, paddingRight: '2.5rem' }} />
              <button type="button" onClick={() => setShowPassword(p => !p)} style={{ position: 'absolute', right: '0.625rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.85rem', padding: 0 }}>
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
            {password.length > 0 && password.length < 6 && (
              <p style={{ color: '#f87171', fontSize: '0.75rem', marginTop: '0.3rem' }}>Password must be at least 6 characters</p>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '0.625rem 1.25rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.875rem' }}>Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={!isValid || mutation.isPending} style={{ padding: '0.625rem 1.5rem', borderRadius: '0.5rem', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', cursor: !isValid ? 'not-allowed' : 'pointer', fontSize: '0.875rem', fontWeight: 600, border: 'none', opacity: !isValid ? 0.5 : 1 }}>
            {mutation.isPending ? 'Adding…' : 'Add User'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditUserModal({ user, onClose }: { user: UserRecord; onClose: () => void }) {
  const [name, setName] = useState(user.name || '');
  const [role, setRole] = useState(user.role);
  const [newPassword, setNewPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: async () => {
      await usersApi.update(user.id, { name, role });
      if (newPassword) {
        if (newPassword.length < 6) throw new Error('Password must be at least 6 characters');
        await usersApi.resetPassword(user.id, newPassword);
      }
    },
    onSuccess: () => { toast.success('User updated'); queryClient.invalidateQueries({ queryKey: ['users'] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '2rem', width: '420px', maxWidth: '95vw' }}>
        <h2 style={{ color: 'var(--text-primary)', fontWeight: 700, marginBottom: '0.25rem' }}>Edit User</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1.5rem' }}>{user.email}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', display: 'block', marginBottom: '0.35rem' }}>Full Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" style={inputStyle} />
          </div>
          <div>
            <label style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', display: 'block', marginBottom: '0.35rem' }}>Role</label>
            <select value={role} onChange={e => setRole(e.target.value as typeof role)} style={inputStyle}>
              {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </div>
          <div>
            <label style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', display: 'block', marginBottom: '0.35rem' }}>New Password <span style={{ color: 'var(--text-faint)' }}>(leave blank to keep current)</span></label>
            <div style={{ position: 'relative' }}>
              <input type={showPw ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min. 6 chars" style={{ ...inputStyle, paddingRight: '2.5rem' }} />
              <button type="button" onClick={() => setShowPw(p => !p)} style={{ position: 'absolute', right: '0.625rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.85rem', padding: 0 }}>
                {showPw ? '🙈' : '👁️'}
              </button>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '0.625rem 1.25rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.875rem' }}>Cancel</button>
          <button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} style={{ padding: '0.625rem 1.5rem', borderRadius: '0.5rem', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, border: 'none' }}>
            {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const { role: currentRole } = useUserContext();
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState<UserRecord | null>(null);
  const [filter, setFilter] = useState('all');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: () => usersApi.list() });

  const changeRoleMutation = useMutation({
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
      {showAdd && <AddUserModal onClose={() => setShowAdd(false)} />}
      {editUser && <EditUserModal user={editUser} onClose={() => setEditUser(null)} />}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>Users</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.25rem' }}>Manage platform users and roles</p>
        </div>
        <button onClick={() => setShowAdd(true)} style={{ padding: '0.75rem 1.5rem', borderRadius: '0.625rem', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, boxShadow: '0 0 20px rgba(99,102,241,0.3)' }}>
          + Add User
        </button>
      </div>

      {/* Role stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {ROLES.map(r => (
          <div key={r} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '1rem', textAlign: 'center' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>{ROLE_LABELS[r]}s</p>
            <p style={{ fontSize: '1.75rem', fontWeight: 700, color: ROLE_COLORS[r] }}>{roleCounts[r] ?? 0}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {['all', ...ROLES].map(r => (
          <button key={r} onClick={() => setFilter(r)} style={{
            padding: '0.375rem 0.875rem', borderRadius: '999px', border: '1px solid', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500, transition: 'all 0.15s',
            background: filter === r ? '#6366f1' : 'transparent',
            color: filter === r ? '#fff' : 'var(--text-muted)',
            borderColor: filter === r ? '#6366f1' : 'var(--border)',
          }}>
            {r === 'all' ? 'All' : ROLE_LABELS[r]}
          </button>
        ))}
      </div>

      {/* Users table */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>No users found</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--table-header-bg)' }}>
                {['Name', 'Email', 'Role', 'Joined', 'Change Role', ''].map(h => (
                  <th key={h} style={{ padding: '0.75rem 1.5rem', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((user: UserRecord) => (
                <tr key={user.id} style={{ borderTop: '1px solid var(--border)', transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'var(--table-row-hover)'}
                  onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}>
                  <td style={{ padding: '1rem 1.5rem', color: 'var(--text-primary)', fontWeight: 500 }}>{user.name || '—'}</td>
                  <td style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{user.email}</td>
                  <td style={{ padding: '1rem 1.5rem' }}>
                    <span style={{ fontSize: '0.73rem', padding: '0.2rem 0.55rem', borderRadius: '999px', background: `${ROLE_COLORS[user.role]}18`, color: ROLE_COLORS[user.role], border: `1px solid ${ROLE_COLORS[user.role]}40`, fontWeight: 600 }}>
                      {ROLE_LABELS[user.role]}
                    </span>
                  </td>
                  <td style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '1rem 1.5rem' }}>
                    <select value={user.role}
                      onChange={e => { if (confirm(`Change ${user.email} role to ${e.target.value}?`)) changeRoleMutation.mutate({ id: user.id, role: e.target.value }); }}
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '0.375rem', padding: '0.3rem 0.5rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                      {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '1rem 1.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button onClick={() => setEditUser(user)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.875rem' }} title="Edit user">✏️</button>
                      <button onClick={() => { if (confirm(`Delete user ${user.email}?`)) deleteMutation.mutate(user.id); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.875rem' }} title="Delete user">🗑️</button>
                    </div>
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
