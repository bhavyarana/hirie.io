const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const requireTeamAccess = require('../middleware/requireTeamAccess');
const { logActivity } = require('../services/activityLogger');
const logger = require('../config/logger');

router.use(authMiddleware);

// GET /api/teams - list teams visible to current user
router.get('/', async (req, res) => {
  const { role, id: userId } = req.user;
  let query = supabase.from('teams').select(`
    *,
    manager:users!teams_manager_id_fkey(id, name, email),
    tl:users!teams_tl_id_fkey(id, name, email),
    team_members(count)
  `).order('created_at', { ascending: false });

  if (role === 'manager') {
    query = query.eq('manager_id', userId);
  } else if (role === 'tl') {
    query = query.eq('tl_id', userId);
  } else if (role === 'recruiter') {
    // Get teams where user is a member
    const { data: memberships } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('user_id', userId);
    const teamIds = (memberships || []).map(m => m.team_id);
    if (teamIds.length === 0) return res.json({ teams: [] });
    query = query.in('id', teamIds);
  }
  // admin: no filter

  const { data, error } = await query;
  if (error) {
    logger.error('Error fetching teams:', error);
    return res.status(500).json({ error: 'Failed to fetch teams' });
  }

  const teams = data.map(t => ({
    ...t,
    member_count: t.team_members?.[0]?.count || 0,
    team_members: undefined,
  }));

  res.json({ teams });
});

// POST /api/teams - admin or manager creates a team
router.post('/', requireRole('admin', 'manager'), async (req, res) => {
  const { name, tl_id } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const managerId = req.user.role === 'admin' ? (req.body.manager_id || req.user.id) : req.user.id;

  const { data, error } = await supabase
    .from('teams')
    .insert({ name, manager_id: managerId, tl_id: tl_id || null })
    .select()
    .single();

  if (error) {
    logger.error('Error creating team:', error);
    return res.status(500).json({ error: error.message || 'Failed to create team' });
  }

  // If tl_id provided, add them as team member with role tl
  if (tl_id) {
    await supabase.from('team_members').upsert(
      { team_id: data.id, user_id: tl_id, role_in_team: 'tl' },
      { onConflict: 'team_id,user_id' }
    );
  }

  await logActivity(req.user.id, 'team_created', 'team', data.id, { name });
  logger.info(`Team created: ${data.id} by ${req.user.id}`);
  res.status(201).json({ team: data });
});

// GET /api/teams/:teamId - team detail with members
router.get('/:teamId', requireTeamAccess('teamId'), async (req, res) => {
  const { data: team, error } = await supabase
    .from('teams')
    .select(`
      *,
      manager:users!teams_manager_id_fkey(id, name, email, role),
      tl:users!teams_tl_id_fkey(id, name, email, role)
    `)
    .eq('id', req.params.teamId)
    .single();

  if (error || !team) return res.status(404).json({ error: 'Team not found' });

  // Get members
  const { data: members } = await supabase
    .from('team_members')
    .select('*, user:users(id, name, email, role)')
    .eq('team_id', req.params.teamId)
    .order('created_at', { ascending: true });

  // Get job count via job_teams (multi-team support)
  const { data: jtCount } = await supabase
    .from('job_teams')
    .select('job_id')
    .eq('team_id', req.params.teamId);
  const jobCount = (jtCount || []).length;

  // Get the actual jobs for this team
  const jobIds = (jtCount || []).map(r => r.job_id);
  let teamJobs = [];
  if (jobIds.length > 0) {
    const { data: jobData } = await supabase
      .from('jobs')
      .select('id, job_title, company_name, status, created_at')
      .in('id', jobIds)
      .order('created_at', { ascending: false });
    teamJobs = jobData || [];
  }

  res.json({ team: { ...team, members: members || [], job_count: jobCount, jobs: teamJobs } });
});

// PATCH /api/teams/:teamId - update team
router.patch('/:teamId', requireRole('admin', 'manager'), requireTeamAccess('teamId'), async (req, res) => {
  const allowed = ['name', 'tl_id', 'manager_id'];
  const updates = {};
  allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

  const { data, error } = await supabase
    .from('teams')
    .update(updates)
    .eq('id', req.params.teamId)
    .select()
    .single();

  if (error || !data) return res.status(404).json({ error: 'Team not found or update failed' });

  // If tl_id changed, upsert team_members
  if (updates.tl_id) {
    await supabase.from('team_members').upsert(
      { team_id: req.params.teamId, user_id: updates.tl_id, role_in_team: 'tl' },
      { onConflict: 'team_id,user_id' }
    );
  }

  res.json({ team: data });
});

// DELETE /api/teams/:teamId
router.delete('/:teamId', requireRole('admin', 'manager'), requireTeamAccess('teamId'), async (req, res) => {
  const { error } = await supabase.from('teams').delete().eq('id', req.params.teamId);
  if (error) return res.status(500).json({ error: 'Failed to delete team' });
  res.json({ message: 'Team deleted' });
});

// POST /api/teams/:teamId/members - add member
router.post('/:teamId/members', requireRole('admin', 'manager'), requireTeamAccess('teamId'), async (req, res) => {
  const { user_id, role_in_team = 'recruiter' } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id is required' });

  const { data, error } = await supabase
    .from('team_members')
    .upsert({ team_id: req.params.teamId, user_id, role_in_team }, { onConflict: 'team_id,user_id' })
    .select()
    .single();

  if (error) {
    logger.error('Error adding team member:', error);
    return res.status(500).json({ error: error.message || 'Failed to add member' });
  }

  // Notify the added user — include team name and adder's name
  try {
    const [{ data: team }, { data: adder }] = await Promise.all([
      supabase.from('teams').select('name').eq('id', req.params.teamId).single(),
      supabase.from('users').select('name, email').eq('id', req.user.id).single(),
    ]);
    const teamName = team?.name || 'a team';
    const adderName = adder?.name || adder?.email || 'Someone';
    await logActivity(
      req.user.id, 'member_added', 'team', req.params.teamId, { user_id, role_in_team },
      [user_id],
      '👥 Added to team',
      `${adderName} added you to "${teamName}" as ${role_in_team}.`
    );
  } catch (notifyErr) {
    logger.warn(`[teams] Failed to send member-added notification: ${notifyErr.message}`);
  }

  res.status(201).json({ member: data });
});

// DELETE /api/teams/:teamId/members/:userId - remove member
router.delete('/:teamId/members/:userId', requireRole('admin', 'manager'), requireTeamAccess('teamId'), async (req, res) => {
  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('team_id', req.params.teamId)
    .eq('user_id', req.params.userId);

  if (error) return res.status(500).json({ error: 'Failed to remove member' });
  res.json({ message: 'Member removed' });
});

// GET /api/teams/:teamId/jobs - list jobs for a team (via job_teams)
router.get('/:teamId/jobs', requireTeamAccess('teamId'), async (req, res) => {
  // Get job IDs from job_teams junction
  const { data: jtRows } = await supabase
    .from('job_teams').select('job_id').eq('team_id', req.params.teamId);
  const jobIds = (jtRows || []).map(r => r.job_id);

  if (jobIds.length === 0) return res.json({ jobs: [] });

  const { data, error } = await supabase
    .from('jobs')
    .select('*, candidates(count)')
    .in('id', jobIds)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: 'Failed to fetch team jobs' });

  const jobs = (data || []).map(j => ({
    ...j,
    candidate_count: j.candidates?.[0]?.count || 0,
    candidates: undefined,
  }));

  res.json({ jobs });
});

// POST /api/teams/:teamId/assign-jobs — assign multiple active jobs to this team
router.post('/:teamId/assign-jobs', requireRole('admin', 'manager'), requireTeamAccess('teamId'), async (req, res) => {
  const { job_ids } = req.body;
  if (!Array.isArray(job_ids)) return res.status(400).json({ error: 'job_ids must be an array' });

  // For each job, upsert into job_teams and update assigned_team_id (legacy compat)
  const errors = [];
  for (const jobId of job_ids) {
    const { error } = await supabase
      .from('job_teams')
      .upsert({ job_id: jobId, team_id: req.params.teamId }, { onConflict: 'job_id,team_id' });
    if (error) errors.push({ jobId, error: error.message });
  }

  if (errors.length > 0) {
    return res.status(500).json({ error: 'Some jobs failed to assign', details: errors });
  }

  res.json({ message: 'Jobs assigned successfully', count: job_ids.length });
});

// DELETE /api/teams/:teamId/assign-jobs/:jobId — remove a job from a team
router.delete('/:teamId/assign-jobs/:jobId', requireRole('admin', 'manager'), requireTeamAccess('teamId'), async (req, res) => {
  const { error } = await supabase
    .from('job_teams')
    .delete()
    .eq('team_id', req.params.teamId)
    .eq('job_id', req.params.jobId);
  if (error) return res.status(500).json({ error: 'Failed to remove job from team' });
  res.json({ message: 'Job removed from team' });
});

// GET /api/teams/:teamId/analytics - team aggregate stats
router.get('/:teamId/analytics', requireTeamAccess('teamId'), async (req, res) => {
  // Job IDs for this team
  const { data: jobs } = await supabase
    .from('jobs').select('id').eq('assigned_team_id', req.params.teamId);
  const jobIds = (jobs || []).map(j => j.id);

  if (jobIds.length === 0) {
    return res.json({ total_jobs: 0, total_candidates: 0, average_score: 0, pass_count: 0, review_count: 0, fail_count: 0 });
  }

  const { data: candidates } = await supabase
    .from('candidates').select('id, recruiter_id').in('job_id', jobIds);
  const candidateIds = (candidates || []).map(c => c.id);

  const { data: scores } = await supabase
    .from('resume_scores').select('score, status').in('candidate_id', candidateIds);

  const total = (scores || []).length;
  const avgScore = total > 0 ? (scores.reduce((s, r) => s + parseFloat(r.score), 0) / total).toFixed(1) : 0;
  const passCount = (scores || []).filter(s => s.status === 'pass').length;
  const reviewCount = (scores || []).filter(s => s.status === 'review').length;
  const failCount = (scores || []).filter(s => s.status === 'fail').length;

  // Recruiter performance
  const recruiterMap = {};
  (candidates || []).forEach(c => {
    recruiterMap[c.recruiter_id] = (recruiterMap[c.recruiter_id] || 0) + 1;
  });

  res.json({
    total_jobs: jobIds.length,
    total_candidates: (candidates || []).length,
    average_score: parseFloat(avgScore),
    pass_count: passCount,
    review_count: reviewCount,
    fail_count: failCount,
    recruiter_performance: Object.entries(recruiterMap).map(([id, count]) => ({ recruiter_id: id, count })),
  });
});

module.exports = router;
