'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useUserContext } from '@/lib/context/UserContext';
import { toast } from 'sonner';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.75rem 1rem',
  background: '#111827', border: '1px solid #1e2d4a',
  borderRadius: '0.5rem', color: '#e2e8f0', fontSize: '0.875rem',
  boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = {
  display: 'block', color: '#94a3b8', fontSize: '0.8rem', marginBottom: '0.4rem',
};

export default function SettingsPage() {
  const { user } = useUserContext();

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) { toast.error('New password must be at least 6 characters'); return; }
    if (newPassword !== confirmPassword) { toast.error('New passwords do not match'); return; }
    if (!user?.email) { toast.error('No user session found'); return; }

    setLoading(true);
    try {
      const supabase = createClient();

      // Step 1: Verify old password by signing in with it
      const { error: verifyErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: oldPassword,
      });
      if (verifyErr) throw new Error('Current password is incorrect');

      // Step 2: Update to new password
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
      if (updateErr) throw updateErr;

      toast.success('Password changed successfully!');
      setOldPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setLoading(false);
    }
  }

  const passwordsMatch = newPassword && confirmPassword && newPassword === confirmPassword;
  const passwordMismatch = newPassword && confirmPassword && newPassword !== confirmPassword;

  return (
    <div style={{ padding: '2rem', maxWidth: '560px' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.25rem' }}>Settings</h1>
      <p style={{ color: '#64748b', marginBottom: '2rem', fontSize: '0.875rem' }}>Manage your account preferences</p>

      {/* Profile info */}
      <div style={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem', padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: '1rem', fontSize: '1rem' }}>Account</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#64748b', fontSize: '0.875rem' }}>Name</span>
            <span style={{ color: '#e2e8f0', fontSize: '0.875rem' }}>{user?.name || '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#64748b', fontSize: '0.875rem' }}>Email</span>
            <span style={{ color: '#e2e8f0', fontSize: '0.875rem' }}>{user?.email}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#64748b', fontSize: '0.875rem' }}>Role</span>
            <span style={{ color: '#a5b4fc', fontSize: '0.875rem', fontWeight: 600, textTransform: 'capitalize' }}>{user?.role}</span>
          </div>
        </div>
      </div>

      {/* Change password */}
      <div style={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem', padding: '1.5rem' }}>
        <h2 style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: '0.25rem', fontSize: '1rem' }}>Change Password</h2>
        <p style={{ color: '#64748b', fontSize: '0.8rem', marginBottom: '1.25rem' }}>You must enter your current password to confirm changes.</p>

        <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={labelStyle}>Current Password</label>
            <input
              type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)}
              placeholder="Enter your current password" required style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>New Password</label>
            <input
              type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
              placeholder="Min. 6 characters" required minLength={6}
              style={{ ...inputStyle, borderColor: passwordMismatch ? '#ef4444' : passwordsMatch ? '#22c55e' : '#1e2d4a' }}
            />
          </div>
          <div>
            <label style={labelStyle}>Confirm New Password</label>
            <input
              type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password" required minLength={6}
              style={{ ...inputStyle, borderColor: passwordMismatch ? '#ef4444' : passwordsMatch ? '#22c55e' : '#1e2d4a' }}
            />
            {passwordMismatch && <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.3rem' }}>Passwords do not match</p>}
            {passwordsMatch && <p style={{ color: '#22c55e', fontSize: '0.75rem', marginTop: '0.3rem' }}>✓ Passwords match</p>}
          </div>
          <button
            type="submit"
            disabled={loading || !!passwordMismatch || !oldPassword || !newPassword}
            style={{
              padding: '0.75rem 1.5rem', borderRadius: '0.625rem',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem', fontWeight: 600, opacity: (!oldPassword || !newPassword || !!passwordMismatch) ? 0.5 : 1,
              alignSelf: 'flex-start',
            }}
          >
            {loading ? 'Updating…' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
