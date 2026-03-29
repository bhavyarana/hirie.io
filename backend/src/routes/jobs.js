const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { logActivity } = require('../services/activityLogger');
const logger = require('../config/logger');

// All job routes require authentication
router.use(authMiddleware);

/**
 * Build role-scoped query for the jobs table.
 * Returns a Supabase query scoped to what the user can see.
 */
async function buildJobsQuery(user) {
  const { role, id: userId } = user;

  let query = supabase
    .from('jobs')
    .select('*, candidates(count), creator:users!jobs_created_by_fkey(id, name, email), job_teams(team_id, team:teams!job_teams_team_id_fkey(id, name))')
    .order('created_at', { ascending: false });

  if (role === 'admin') {
    // Admin sees all
    return query;
  }

  if (role === 'manager') {
    // Manager sees jobs they created OR jobs in their teams (via job_teams junction)
    const { data: managerTeams } = await supabase
      .from('teams').select('id').eq('manager_id', userId);
    const teamIds = (managerTeams || []).map(t => t.id);

    if (teamIds.length > 0) {
      // Get job IDs from job_teams
      const { data: jtRows } = await supabase
        .from('job_teams').select('job_id').in('team_id', teamIds);
      const teamJobIds = (jtRows || []).map(r => r.job_id);

      if (teamJobIds.length > 0) {
        // Jobs created by manager OR in their teams via job_teams
        return query.or(`created_by.eq.${userId},id.in.(${teamJobIds.join(',')})`);
      }
    }
    // No teams or no team jobs — just their own created jobs
    return query.eq('created_by', userId);
  }

  if (role === 'tl') {
    // TL sees jobs assigned to their teams (via job_teams OR assigned_team_id)
    const { data: tlTeams } = await supabase
      .from('teams').select('id').eq('tl_id', userId);
    const teamIds = (tlTeams || []).map(t => t.id);
    if (teamIds.length === 0) return query.eq('id', '00000000-0000-0000-0000-000000000000');
    // Fetch job IDs from job_teams junction table
    const { data: jtRows } = await supabase
      .from('job_teams').select('job_id').in('team_id', teamIds);
    const jobIds = (jtRows || []).map(r => r.job_id);
    if (jobIds.length === 0) return query.eq('id', '00000000-0000-0000-0000-000000000000');
    return query.in('id', jobIds);
  }

  // Recruiter: ONLY jobs explicitly assigned to them by a TL via job_recruiter_assignments
  const { data: assignments } = await supabase
    .from('job_recruiter_assignments')
    .select('job_id')
    .eq('recruiter_id', userId);
  const jobIds = (assignments || []).map(a => a.job_id);
  if (jobIds.length === 0) return query.eq('id', '00000000-0000-0000-0000-000000000000');
  return query.in('id', jobIds);
}

// POST /api/jobs - Create a new job (admin, manager only)
router.post('/', requireRole('admin', 'manager'), async (req, res) => {
  const { job_title, company_name, job_description_text, required_skills, assigned_team_id, scoring_criteria } = req.body;

  if (!job_title || !company_name || !job_description_text) {
    return res.status(400).json({ error: 'job_title, company_name, and job_description_text are required' });
  }

  // Validate team access for manager
  if (req.user.role === 'manager' && assigned_team_id) {
    const { data: team } = await supabase
      .from('teams').select('id').eq('id', assigned_team_id).eq('manager_id', req.user.id).single();
    if (!team) {
      return res.status(403).json({ error: 'You do not manage the specified team' });
    }
  }

  const { data, error } = await supabase
    .from('jobs')
    .insert({
      created_by: req.user.id,
      job_title,
      company_name,
      job_description_text,
      required_skills: required_skills || [],
      assigned_team_id: assigned_team_id || null,
      scoring_criteria: scoring_criteria || null,
    })
    .select()
    .single();

  if (error) {
    logger.error('Error creating job:', error);
    return res.status(500).json({
      error: error.message || 'Failed to create job',
      hint: error.hint || null,
    });
  }

  // Notify TL of assigned team + all admins
  if (assigned_team_id) {
    const { data: team } = await supabase.from('teams').select('tl_id, name').eq('id', assigned_team_id).single();
    // Collect TL + all admins
    const { data: adminUsers } = await supabase.from('users').select('id').eq('role', 'admin');
    const notifySet = new Set((adminUsers || []).map(u => u.id));
    if (team?.tl_id) notifySet.add(team.tl_id);
    notifySet.delete(req.user.id); // don't notify the creator
    if (notifySet.size > 0) {
      await logActivity(
        req.user.id, 'job_created', 'job', data.id,
        { job_title, team_id: assigned_team_id },
        [...notifySet],
        'New job assigned to your team',
        `Job "${job_title}" has been assigned to team "${team?.name || ''}".`
      );
    }
  } else {
    await logActivity(req.user.id, 'job_created', 'job', data.id, { job_title });
  }

  logger.info(`Job created: ${data.id} by ${req.user.id}`);
  res.status(201).json({ job: data });
});

// GET /api/jobs - List jobs (role-scoped)
router.get('/', async (req, res) => {
  try {
    const query = await buildJobsQuery(req.user);
    const { data, error } = await query;

    if (error) {
      logger.error('Error fetching jobs:', error);
      return res.status(500).json({ error: error.message || 'Failed to fetch jobs' });
    }

    const jobs = (data || []).map(job => ({
      ...job,
      candidate_count: job.candidates?.[0]?.count || 0,
      candidates: undefined,
      teams: (job.job_teams || []).map(jt => jt.team).filter(Boolean),
      job_teams: undefined,
    }));

    res.json({ jobs });
  } catch (err) {
    logger.error('Error in jobs GET:', err);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// GET /api/jobs/:id - Get single job (role-scoped)
router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('jobs')
    .select(`
      *,
      team:teams!jobs_assigned_team_id_fkey(id, name, manager_id, tl_id,
        manager:users!teams_manager_id_fkey(id, name, email),
        tl:users!teams_tl_id_fkey(id, name, email)
      ),
      job_teams(team_id, team:teams!job_teams_team_id_fkey(id, name)),
      creator:users!jobs_created_by_fkey(id, name, email)
    `)
    .eq('id', req.params.id)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: 'Job not found' });
  }

  // Check role-based access
  const { role, id: userId } = req.user;
  // Collect all team IDs this job belongs to (from job_teams + legacy assigned_team_id)
  const jobTeamIds = (data.job_teams || []).map(jt => jt.team_id).filter(Boolean);
  if (data.assigned_team_id && !jobTeamIds.includes(data.assigned_team_id)) {
    jobTeamIds.push(data.assigned_team_id);
  }

  if (role === 'manager') {
    // Manager must have created the job or manage at least one of its teams
    if (data.created_by !== userId) {
      const { data: mgrTeams } = await supabase.from('teams').select('id').eq('manager_id', userId).in('id', jobTeamIds.length ? jobTeamIds : ['00000000-0000-0000-0000-000000000000']);
      if (!mgrTeams || mgrTeams.length === 0) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
  } else if (role === 'tl') {
    // TL must lead at least one of the job's teams
    if (jobTeamIds.length === 0) return res.status(403).json({ error: 'Access denied' });
    const { data: tlTeam } = await supabase.from('teams').select('id').eq('tl_id', userId).in('id', jobTeamIds).limit(1).single();
    if (!tlTeam) return res.status(403).json({ error: 'Access denied' });
  } else if (role === 'recruiter') {
    // Recruiter must be a member of at least one of the job's teams
    if (jobTeamIds.length === 0) return res.status(403).json({ error: 'Access denied' });
    const { data: mem } = await supabase.from('team_members').select('id').eq('user_id', userId).in('team_id', jobTeamIds).limit(1).single();
    if (!mem) return res.status(403).json({ error: 'Access denied' });
  }

  // Recruiter performance for this job
  const { data: recruiterStats } = await supabase
    .from('candidates')
    .select('recruiter_id, users!candidates_recruiter_id_fkey(name, email)')
    .eq('job_id', req.params.id);

  const recruiterMap = {};
  (recruiterStats || []).forEach(c => {
    const rid = c.recruiter_id;
    if (!recruiterMap[rid]) {
      recruiterMap[rid] = { recruiter_id: rid, name: c.users?.name || c.users?.email || rid, count: 0 };
    }
    recruiterMap[rid].count++;
  });

  res.json({ job: {
    ...data,
    teams: (data.job_teams || []).map(jt => jt.team).filter(Boolean),
    job_teams: undefined,
    recruiter_performance: Object.values(recruiterMap),
  } });
});

// PATCH /api/jobs/:id - Update a job (admin, manager)
router.patch('/:id', requireRole('admin', 'manager'), async (req, res) => {
  const allowedFields = ['job_title', 'company_name', 'job_description_text', 'required_skills', 'status', 'assigned_team_id'];
  const updates = {};
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });

  // Scope update to jobs the manager owns or manages
  let query = supabase.from('jobs').update(updates).eq('id', req.params.id);
  if (req.user.role === 'manager') {
    const { data: managerTeams } = await supabase.from('teams').select('id').eq('manager_id', req.user.id);
    const teamIds = (managerTeams || []).map(t => t.id);
    // Will let RLS policy handle rejection
  }

  const { data, error } = await query.select().single();

  if (error || !data) {
    return res.status(404).json({ error: 'Job not found or update failed' });
  }

  res.json({ job: data });
});

// DELETE /api/jobs/:id - Delete a job (admin, manager)
router.delete('/:id', requireRole('admin', 'manager'), async (req, res) => {
  const { error } = await supabase
    .from('jobs')
    .delete()
    .eq('id', req.params.id);

  if (error) {
    return res.status(500).json({ error: 'Failed to delete job' });
  }

  res.json({ message: 'Job deleted successfully' });
});

// POST /api/jobs/:id/teams  — set multi-team assignments (admin, manager)
// Receives { team_ids: string[] }; replaces all existing entries for this job.
router.post('/:id/teams', requireRole('admin', 'manager'), async (req, res) => {
  const { team_ids } = req.body;
  if (!Array.isArray(team_ids)) {
    return res.status(400).json({ error: 'team_ids must be an array' });
  }

  const jobId = req.params.id;
  const newTeamIdSet = new Set(team_ids);

  // ── Step 1: Find teams being REMOVED ─────────────────────────────────────
  const { data: currentJt } = await supabase
    .from('job_teams')
    .select('team_id')
    .eq('job_id', jobId);

  const removedTeamIds = (currentJt || [])
    .map(r => r.team_id)
    .filter(id => !newTeamIdSet.has(id));

  // ── Step 2: Auto-deassign recruiters from removed teams ───────────────────
  if (removedTeamIds.length > 0) {
    // Get all members of removed teams
    const { data: removedMembers } = await supabase
      .from('team_members')
      .select('user_id')
      .in('team_id', removedTeamIds);

    const removedUserIds = (removedMembers || []).map(m => m.user_id);

    if (removedUserIds.length > 0) {
      // But keep recruiters who are also in a still-assigned team
      const { data: stillMembers } = team_ids.length > 0
        ? await supabase
            .from('team_members')
            .select('user_id')
            .in('team_id', team_ids)
        : { data: [] };

      const stillUserIds = new Set((stillMembers || []).map(m => m.user_id));
      const toRemove = removedUserIds.filter(uid => !stillUserIds.has(uid));

      if (toRemove.length > 0) {
        await supabase
          .from('job_assignments')
          .delete()
          .eq('job_id', jobId)
          .in('recruiter_id', toRemove);
      }
    }
  }

  // ── Step 3: Replace team assignments ─────────────────────────────────────
  await supabase.from('job_teams').delete().eq('job_id', jobId);

  if (team_ids.length === 0) return res.json({ teams: [] });

  const rows = team_ids.map(team_id => ({ job_id: jobId, team_id }));
  const { data, error } = await supabase.from('job_teams').insert(rows).select('team_id, team:teams(id, name)');

  if (error) {
    logger.error('Error setting job teams:', error);
    return res.status(500).json({ error: error.message });
  }

  // Also update the legacy assigned_team_id to the first selected team for backwards compat
  if (team_ids.length > 0) {
    await supabase.from('jobs').update({ assigned_team_id: team_ids[0] }).eq('id', jobId);
  }

  // Notify TL + manager of each team + all admins
  const { data: adminUsers } = await supabase.from('users').select('id').eq('role', 'admin');
  const globalAdminIds = (adminUsers || []).map(u => u.id);

  for (const team_id of team_ids) {
    const { data: team } = await supabase.from('teams').select('tl_id, manager_id, name').eq('id', team_id).single();
    if (team) {
      const notifySet = new Set(globalAdminIds);
      if (team.tl_id) notifySet.add(team.tl_id);
      if (team.manager_id) notifySet.add(team.manager_id);
      notifySet.delete(req.user.id);
      if (notifySet.size > 0) {
        await logActivity(
          req.user.id, 'job_team_assigned', 'job', jobId,
          { team_id }, [...notifySet],
          'Job assigned to your team',
          `A job has been assigned to team "${team.name}".`
        );
      }
    }
  }

  res.json({ teams: (data || []).map(r => r.team) });
});

// GET /api/jobs/:id/teams  — get current team assignments
router.get('/:id/teams', async (req, res) => {
  const { data, error } = await supabase
    .from('job_teams')
    .select('team_id, team:teams(id, name)')
    .eq('job_id', req.params.id);
  if (error) return res.status(500).json({ error: 'Failed to fetch job teams' });
  res.json({ teams: (data || []).map(r => r.team) });
});

// GET /api/jobs/overview - admin/manager summary
router.get('/analytics/overview', requireRole('admin', 'manager'), async (req, res) => {
  const { id: userId, role } = req.user;

  let scopedJobIds = null; // null = all jobs (admin)

  if (role === 'manager') {
    const { data: mgrTeams } = await supabase.from('teams').select('id').eq('manager_id', userId);
    const tids = (mgrTeams || []).map(t => t.id);

    let teamJobIds = [];
    if (tids.length > 0) {
      const { data: jtRows } = await supabase.from('job_teams').select('job_id').in('team_id', tids);
      teamJobIds = (jtRows || []).map(r => r.job_id);
    }

    // Jobs created by manager OR in their teams
    const { data: createdJobs } = await supabase.from('jobs').select('id').eq('created_by', userId);
    const createdIds = (createdJobs || []).map(j => j.id);
    scopedJobIds = [...new Set([...createdIds, ...teamJobIds])];
  }

  // Job counts
  let jobsQ = supabase.from('jobs').select('id, status', { count: 'exact' });
  if (scopedJobIds !== null) {
    if (scopedJobIds.length === 0) {
      return res.json({ total_jobs: 0, active_jobs: 0, total_candidates: 0, total_users: 0, total_teams: 0 });
    }
    jobsQ = jobsQ.in('id', scopedJobIds);
  }

  const { data: jobs, count: jobCount } = await jobsQ;
  const activeJobs = (jobs || []).filter(j => j.status === 'active').length;

  // Candidate count scoped to manager's jobs
  let candidateCount = 0;
  if (scopedJobIds !== null) {
    const { count } = await supabase.from('candidates').select('id', { count: 'exact', head: true }).in('job_id', scopedJobIds);
    candidateCount = count || 0;
  } else {
    const { count } = await supabase.from('candidates').select('id', { count: 'exact', head: true });
    candidateCount = count || 0;
  }

  // Team count scoped to manager
  let teamCount = 0;
  if (role === 'manager') {
    const { count } = await supabase.from('teams').select('id', { count: 'exact', head: true }).eq('manager_id', userId);
    teamCount = count || 0;
  } else {
    const { count } = await supabase.from('teams').select('id', { count: 'exact', head: true });
    teamCount = count || 0;
  }

  const { count: userCount } = await supabase.from('users').select('id', { count: 'exact', head: true });

  res.json({
    total_jobs: jobCount || 0,
    active_jobs: activeJobs || 0,
    total_candidates: candidateCount,
    total_users: userCount || 0,
    total_teams: teamCount,
  });
});


module.exports = router;
