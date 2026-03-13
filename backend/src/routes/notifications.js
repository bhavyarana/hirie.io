const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/notifications - list recent notifications for current user
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return res.status(500).json({ error: 'Failed to fetch notifications' });

  const unread = (data || []).filter(n => !n.is_read).length;
  res.json({ notifications: data || [], unread_count: unread });
});

// PATCH /api/notifications/:id/read - mark single notification as read
router.patch('/:id/read', async (req, res) => {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) return res.status(500).json({ error: 'Failed to mark as read' });
  res.json({ message: 'Marked as read' });
});

// POST /api/notifications/read-all - mark all as read
router.post('/read-all', async (req, res) => {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', req.user.id)
    .eq('is_read', false);

  if (error) return res.status(500).json({ error: 'Failed to mark all as read' });
  res.json({ message: 'All notifications marked as read' });
});

module.exports = router;
