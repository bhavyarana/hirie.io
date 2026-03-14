const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const logger = require('../config/logger');

router.use(authMiddleware);

// GET /api/job-assignments?recruiter_id=X  — list all job assignments for a recruiter
router.get('/', async (req, res) => {
  const { recruiter_id } = req.query;
  const { role, id: userId } = req.user;

  let query = supabase
    .from('job_recruiter_assignments')
    .select('*, job:jobs(id, job_title, company_name, status), recruiter:users!job_recruiter_assignments_recruiter_id_fkey(id, name, email)');

  // TL can only see assignments they made, admin/manager see all
  if (role === 'tl') {
    query = query.eq('assigned_by', userId);
  }

  if (recruiter_id) {
    query = query.eq('recruiter_id', recruiter_id);
  }

  const { data, error } = await query.order('assigned_at', { ascending: false });
  if (error) {
    logger.error('Error fetching job assignments:', error);
    return res.status(500).json({ error: 'Failed to fetch assignments' });
  }
  res.json({ assignments: data });
});

// POST /api/job-assignments  — TL/admin/manager assigns a job to a recruiter
router.post('/', requireRole('admin', 'manager', 'tl'), async (req, res) => {
  const { job_id, recruiter_id } = req.body;
  if (!job_id || !recruiter_id) {
    return res.status(400).json({ error: 'job_id and recruiter_id are required' });
  }

  // TL can only assign jobs from their teams
  if (req.user.role === 'tl') {
    // Verify the job belongs to a team where this TL is leader
    const { data: teamCheck } = await supabase
      .from('job_teams')
      .select('team_id, team:teams!job_teams_team_id_fkey(tl_id)')
      .eq('job_id', job_id);

    const isTLForJob = (teamCheck || []).some(t => t.team?.tl_id === req.user.id);
    if (!isTLForJob) {
      return res.status(403).json({ error: 'You can only assign jobs from your teams' });
    }
  }

  const { data, error } = await supabase
    .from('job_recruiter_assignments')
    .upsert({ job_id, recruiter_id, assigned_by: req.user.id }, { onConflict: 'job_id,recruiter_id' })
    .select()
    .single();

  if (error) {
    logger.error('Error creating job assignment:', error);
    return res.status(500).json({ error: error.message || 'Failed to assign job' });
  }

  res.status(201).json({ assignment: data });
});

// DELETE /api/job-assignments  — remove a job assignment
router.delete('/', requireRole('admin', 'manager', 'tl'), async (req, res) => {
  const { job_id, recruiter_id } = req.body;
  if (!job_id || !recruiter_id) {
    return res.status(400).json({ error: 'job_id and recruiter_id are required' });
  }

  const { error } = await supabase
    .from('job_recruiter_assignments')
    .delete()
    .eq('job_id', job_id)
    .eq('recruiter_id', recruiter_id);

  if (error) return res.status(500).json({ error: 'Failed to remove assignment' });
  res.json({ message: 'Assignment removed' });
});

// POST /api/job-assignments/bulk  — assign multiple jobs to a recruiter at once
router.post('/bulk', requireRole('admin', 'manager', 'tl'), async (req, res) => {
  const { recruiter_id, job_ids } = req.body;
  if (!recruiter_id || !Array.isArray(job_ids)) {
    return res.status(400).json({ error: 'recruiter_id and job_ids[] are required' });
  }

  // Delete existing assignments for this recruiter (replace mode)
  const { error: delErr } = await supabase
    .from('job_recruiter_assignments')
    .delete()
    .eq('recruiter_id', recruiter_id);

  if (delErr) return res.status(500).json({ error: 'Failed to clear existing assignments' });

  if (job_ids.length === 0) return res.json({ assignments: [] });

  const rows = job_ids.map(job_id => ({ job_id, recruiter_id, assigned_by: req.user.id }));
  const { data, error } = await supabase
    .from('job_recruiter_assignments')
    .insert(rows)
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ assignments: data });
});

module.exports = router;
