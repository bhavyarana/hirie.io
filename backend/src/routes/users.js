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

// POST /api/users - admin only: create/invite user
// Supabase doesn't support direct invite from service role easily; instead, 
// upsert the users row – the auth account must be created via Supabase invite or signup.
router.post('/', requireRole('admin'), async (req, res) => {
  const { email, name, role } = req.body;

  if (!email || !role) {
    return res.status(400).json({ error: 'email and role are required' });
  }

  const validRoles = ['admin', 'manager', 'tl', 'recruiter'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
  }

  // Try to invite via Supabase admin API
  const { data: inviteData, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { name, role },
  });

  if (inviteErr) {
    logger.error('Invite user error:', inviteErr);
    return res.status(500).json({ error: inviteErr.message || 'Failed to invite user' });
  }

  const uid = inviteData?.user?.id;

  if (uid) {
    // Upsert users row
    await supabase.from('users').upsert({ id: uid, email, name, role }, { onConflict: 'id' });
  }

  res.status(201).json({ message: `Invitation sent to ${email}`, userId: uid });
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
