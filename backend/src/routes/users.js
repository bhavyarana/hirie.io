const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const logger = require('../config/logger');

router.use(authMiddleware);

// GET /api/users/me - get current user profile
router.get('/me', async (req, res) => {
  res.json({ user: req.user });
});

// GET /api/users - admin only: list all users
router.get('/', requireRole('admin'), async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('Error fetching users:', error);
    return res.status(500).json({ error: 'Failed to fetch users' });
  }
  res.json({ users: data });
});

// POST /api/users - admin only: create user directly with a password (no email invite)
router.post('/', requireRole('admin'), async (req, res) => {
  const { email, name, role, password } = req.body;

  if (!email || !role) {
    return res.status(400).json({ error: 'email and role are required' });
  }

  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'password is required and must be at least 6 characters' });
  }

  const validRoles = ['admin', 'manager', 'tl', 'recruiter'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
  }

  // Create user directly via Supabase admin API — no invite email sent
  const { data: createData, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // auto-confirm so user can log in immediately
    user_metadata: { name, role },
  });

  if (createErr) {
    logger.error('Create user error:', createErr);
    return res.status(500).json({ error: createErr.message || 'Failed to create user' });
  }

  const uid = createData?.user?.id;

  if (uid) {
    // Upsert users row with role
    await supabase.from('users').upsert({ id: uid, email, name, role }, { onConflict: 'id' });
  }

  logger.info(`User created: ${email} (${role}) by admin ${req.user.id}`);
  res.status(201).json({ message: `User ${email} created successfully`, userId: uid });
});

// POST /api/users/:id/reset-password - admin only: reset another user's password
router.post('/:id/reset-password', requireRole('admin'), async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'password must be at least 6 characters' });
  }

  const { error } = await supabase.auth.admin.updateUserById(req.params.id, { password });
  if (error) {
    logger.error('Password reset error:', error);
    return res.status(500).json({ error: error.message || 'Failed to reset password' });
  }

  logger.info(`Password reset for user ${req.params.id} by admin ${req.user.id}`);
  res.json({ message: 'Password updated successfully' });
});

// PATCH /api/users/:id - admin only: update user role or name
router.patch('/:id', requireRole('admin'), async (req, res) => {
  const { name, role } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (role !== undefined) {
    const validRoles = ['admin', 'manager', 'tl', 'recruiter'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    updates.role = role;
  }

  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error || !data) {
    return res.status(404).json({ error: 'User not found or update failed' });
  }
  res.json({ user: data });
});

// DELETE /api/users/:id - admin only
router.delete('/:id', requireRole('admin'), async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  const { error } = await supabase.from('users').delete().eq('id', req.params.id);
  if (error) {
    return res.status(500).json({ error: 'Failed to delete user' });
  }
  res.json({ message: 'User deleted' });
});

module.exports = router;
