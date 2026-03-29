const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');
const logger = require('../config/logger');

router.use(authMiddleware);

// ─── Helper: build date filter clause ────────────────────────────────────────
function applyDateFilter(query, dateFrom, dateTo) {
  if (dateFrom) query = query.gte('candidates.created_at', dateFrom);
  if (dateTo)   query = query.lte('candidates.created_at', dateTo + 'T23:59:59.999Z');
  return query;
}

// ─── Helper: fetch pass-only candidates scoped to role ───────────────────────
// Returns { candidates, jobIds, recruiterIds } arrays all pass-filtered.
// Includes both:
//   1. Candidates whose resume_scores.status = 'pass' (natural pass)
//   2. Candidates with score_override_status = 'pass' (manually forced pass)
async function getScopedPassCandidates(user, dateFrom, dateTo) {
  const { role, id: userId } = user;

  // Step 1: determine which job IDs this user can see
  let allowedJobIds = null; // null = all jobs (admin)

  if (role === 'manager') {
    // Manager: teams they manage
    const { data: myTeams } = await supabase.from('teams').select('id').eq('manager_id', userId);
    const teamIds = (myTeams || []).map(t => t.id);
    if (!teamIds.length) return { candidates: [], jobIds: [], recruiterIds: [] };
    const { data: jtRows } = await supabase.from('job_teams').select('job_id').in('team_id', teamIds);
    const teamJobIds = (jtRows || []).map(r => r.job_id);
    // Also include jobs created by manager directly
    const { data: createdJobs } = await supabase.from('jobs').select('id').eq('created_by', userId);
    const createdIds = (createdJobs || []).map(j => j.id);
    allowedJobIds = [...new Set([...teamJobIds, ...createdIds])];
    if (!allowedJobIds.length) return { candidates: [], jobIds: [], recruiterIds: [] };
  } else if (role === 'tl') {
    // TL: teams they lead
    const { data: myTeams } = await supabase.from('teams').select('id').eq('tl_id', userId);
    const teamIds = (myTeams || []).map(t => t.id);
    if (!teamIds.length) return { candidates: [], jobIds: [], recruiterIds: [] };
    const { data: jtRows } = await supabase.from('job_teams').select('job_id').in('team_id', teamIds);
    allowedJobIds = (jtRows || []).map(r => r.job_id);
    if (!allowedJobIds.length) return { candidates: [], jobIds: [], recruiterIds: [] };
  }
  // admin → allowedJobIds remains null (no filter)

  // ── Step 2a: Natural pass candidates (resume_scores.status = 'pass') ────────
  let naturalQuery = supabase
    .from('candidates')
    .select(`
      id, name, email, job_id, recruiter_id, created_at, score_override_status,
      resume_scores!inner(score, status)
    `)
    .eq('processing_status', 'completed')
    .eq('resume_scores.status', 'pass');

  if (allowedJobIds !== null) naturalQuery = naturalQuery.in('job_id', allowedJobIds);
  if (dateFrom) naturalQuery = naturalQuery.gte('created_at', dateFrom);
  if (dateTo)   naturalQuery = naturalQuery.lte('created_at', dateTo + 'T23:59:59.999Z');
  naturalQuery = naturalQuery.order('created_at', { ascending: false });

  const { data: naturalData, error: naturalError } = await naturalQuery;
  if (naturalError) {
    logger.error('[Submissions] natural pass query error: ' + naturalError.message);
    throw naturalError;
  }

  // ── Step 2b: Manually overridden candidates (score_override_status = 'pass') ─
  // These may have review/fail in resume_scores but were force-passed by a user.
  let overrideQuery = supabase
    .from('candidates')
    .select(`
      id, name, email, job_id, recruiter_id, created_at, score_override_status,
      resume_scores(score, status)
    `)
    .eq('processing_status', 'completed')
    .eq('score_override_status', 'pass');

  if (allowedJobIds !== null) overrideQuery = overrideQuery.in('job_id', allowedJobIds);
  if (dateFrom) overrideQuery = overrideQuery.gte('created_at', dateFrom);
  if (dateTo)   overrideQuery = overrideQuery.lte('created_at', dateTo + 'T23:59:59.999Z');
  overrideQuery = overrideQuery.order('created_at', { ascending: false });

  const { data: overrideData, error: overrideError } = await overrideQuery;
  if (overrideError) {
    logger.error('[Submissions] override pass query error: ' + overrideError.message);
    throw overrideError;
  }

  // ── Step 2c: Merge, deduplicate by candidate id ────────────────────────────
  const seen = new Set();
  const allRaw = [...(naturalData || []), ...(overrideData || [])];
  const deduplicated = allRaw.filter(c => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const candidates = deduplicated.map(c => ({
    ...c,
    score: c.resume_scores?.[0]?.score ?? null,
    score_status: c.score_override_status === 'pass' ? 'pass' : (c.resume_scores?.[0]?.status ?? null),
    resume_scores: undefined,
  }));

  const jobIds = [...new Set(candidates.map(c => c.job_id).filter(Boolean))];
  const recruiterIds = [...new Set(candidates.map(c => c.recruiter_id).filter(Boolean))];

  return { candidates, jobIds, recruiterIds };
}

// ─── GET /api/submissions/summary ────────────────────────────────────────────
// Top-level KPI summary for the current user + date range
router.get('/summary', async (req, res) => {
  const { date_from, date_to } = req.query;
  try {
    const { candidates, jobIds, recruiterIds } = await getScopedPassCandidates(req.user, date_from, date_to);

    const totalSubmissions = candidates.length;
    const avgScore = totalSubmissions
      ? parseFloat((candidates.reduce((s, c) => s + Number(c.score || 0), 0) / totalSubmissions).toFixed(1))
      : 0;

    // Best recruiter by pass count
    const recruiterCounts = {};
    candidates.forEach(c => {
      if (c.recruiter_id) recruiterCounts[c.recruiter_id] = (recruiterCounts[c.recruiter_id] || 0) + 1;
    });
    const topRecruiterId = Object.entries(recruiterCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    let topRecruiter = null;
    if (topRecruiterId) {
      const { data: u } = await supabase.from('users').select('id, name, email').eq('id', topRecruiterId).single();
      topRecruiter = u ? { id: u.id, name: u.name || u.email, count: recruiterCounts[topRecruiterId] } : null;
    }

    // Timeline: group by date
    const byDate = {};
    candidates.forEach(c => {
      const d = c.created_at.slice(0, 10);
      byDate[d] = (byDate[d] || 0) + 1;
    });
    const timeline = Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }));

    res.json({
      total_submissions: totalSubmissions,
      total_jobs: jobIds.length,
      total_recruiters: recruiterIds.length,
      avg_score: avgScore,
      top_recruiter: topRecruiter,
      timeline,
    });
  } catch (err) {
    logger.error('[Submissions] summary error: ' + err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/submissions/by-recruiter ───────────────────────────────────────
router.get('/by-recruiter', async (req, res) => {
  const { date_from, date_to } = req.query;
  try {
    const { candidates, recruiterIds } = await getScopedPassCandidates(req.user, date_from, date_to);

    if (!recruiterIds.length) return res.json({ recruiters: [] });

    // Option B for manager: only recruiters who have actual pass submissions in scope
    const { data: users } = await supabase
      .from('users')
      .select('id, name, email, role')
      .in('id', recruiterIds);

    const userMap = Object.fromEntries((users || []).map(u => [u.id, u]));

    const recruiterMap = {};
    candidates.forEach(c => {
      if (!c.recruiter_id) return;
      if (!recruiterMap[c.recruiter_id]) {
        const u = userMap[c.recruiter_id];
        recruiterMap[c.recruiter_id] = {
          id: c.recruiter_id,
          name: u?.name || u?.email || c.recruiter_id,
          email: u?.email || null,
          role: u?.role || null,
          submission_count: 0,
          job_count: 0,
          avg_score: 0,
          jobs: new Set(),
          scores: [],
        };
      }
      recruiterMap[c.recruiter_id].submission_count++;
      recruiterMap[c.recruiter_id].jobs.add(c.job_id);
      if (c.score != null) recruiterMap[c.recruiter_id].scores.push(Number(c.score));
    });

    const recruiters = Object.values(recruiterMap).map(r => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      submission_count: r.submission_count,
      job_count: r.jobs.size,
      avg_score: r.scores.length
        ? parseFloat((r.scores.reduce((s, v) => s + v, 0) / r.scores.length).toFixed(1))
        : 0,
    })).sort((a, b) => b.submission_count - a.submission_count);

    res.json({ recruiters });
  } catch (err) {
    logger.error('[Submissions] by-recruiter error: ' + err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/submissions/by-recruiter/:id ───────────────────────────────────
router.get('/by-recruiter/:id', async (req, res) => {
  const { id: targetId } = req.params;
  const { date_from, date_to } = req.query;
  try {
    const { candidates } = await getScopedPassCandidates(req.user, date_from, date_to);
    const recruiterCands = candidates.filter(c => c.recruiter_id === targetId);

    // Recruiter info
    const { data: recruiter } = await supabase
      .from('users').select('id, name, email, role').eq('id', targetId).single();

    if (!recruiter) return res.status(404).json({ error: 'Recruiter not found' });

    // Jobs breakdown
    const jobIds = [...new Set(recruiterCands.map(c => c.job_id).filter(Boolean))];
    let jobDetails = [];
    if (jobIds.length) {
      const { data: jobs } = await supabase
        .from('jobs').select('id, job_title, company_name, status').in('id', jobIds);
      const jobMap = Object.fromEntries((jobs || []).map(j => [j.id, j]));
      const jobCounts = {};
      recruiterCands.forEach(c => { jobCounts[c.job_id] = (jobCounts[c.job_id] || 0) + 1; });
      jobDetails = jobIds.map(jid => ({
        id: jid,
        title: jobMap[jid]?.job_title || '—',
        company: jobMap[jid]?.company_name || '—',
        status: jobMap[jid]?.status || '—',
        submission_count: jobCounts[jid] || 0,
      })).sort((a, b) => b.submission_count - a.submission_count);
    }

    // Timeline by date
    const byDate = {};
    recruiterCands.forEach(c => {
      const d = c.created_at.slice(0, 10);
      byDate[d] = (byDate[d] || 0) + 1;
    });
    const timeline = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    // Candidate list — fetch names for display
    const candIds = recruiterCands.map(c => c.id);
    let enrichedCands = recruiterCands;
    if (candIds.length) {
      const { data: fullCands } = await supabase
        .from('candidates')
        .select('id, name, email, job_id, created_at, resume_scores(score, status)')
        .in('id', candIds);
      const jobMap2 = Object.fromEntries(jobDetails.map(j => [j.id, j]));
      enrichedCands = (fullCands || []).map(c => ({
        id: c.id,
        name: c.name || '(name pending)',
        email: c.email,
        score: c.resume_scores?.[0]?.score ?? null,
        score_status: c.resume_scores?.[0]?.status ?? null,
        job_id: c.job_id,
        job_title: jobMap2[c.job_id]?.title || '—',
        submitted_at: c.created_at,
      }));
    }

    const scores = recruiterCands.map(c => Number(c.score || 0)).filter(Boolean);
    const avgScore = scores.length ? parseFloat((scores.reduce((s, v) => s + v, 0) / scores.length).toFixed(1)) : 0;

    res.json({
      recruiter: {
        id: recruiter.id,
        name: recruiter.name || recruiter.email,
        email: recruiter.email,
        role: recruiter.role,
      },
      kpis: {
        total_submissions: recruiterCands.length,
        jobs_count: jobIds.length,
        avg_score: avgScore,
      },
      jobs: jobDetails,
      candidates: enrichedCands,
      timeline,
    });
  } catch (err) {
    logger.error('[Submissions] by-recruiter/:id error: ' + err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/submissions/by-team ────────────────────────────────────────────
router.get('/by-team', async (req, res) => {
  const { date_from, date_to } = req.query;
  const { role, id: userId } = req.user;
  try {
    const { candidates, jobIds } = await getScopedPassCandidates(req.user, date_from, date_to);

    // Get teams in scope
    let teamsQuery = supabase.from('teams').select('id, name, manager_id, tl_id, manager:users!teams_manager_id_fkey(id,name,email), tl:users!teams_tl_id_fkey(id,name,email)');
    if (role === 'manager') teamsQuery = teamsQuery.eq('manager_id', userId);
    else if (role === 'tl') teamsQuery = teamsQuery.eq('tl_id', userId);
    const { data: teams } = await teamsQuery;
    if (!teams?.length) return res.json({ teams: [] });

    // Map job → teams
    let jobToTeams = {};
    if (jobIds.length) {
      const { data: jtRows } = await supabase
        .from('job_teams').select('job_id, team_id').in('job_id', jobIds);
      (jtRows || []).forEach(r => {
        if (!jobToTeams[r.team_id]) jobToTeams[r.team_id] = new Set();
        jobToTeams[r.team_id].add(r.job_id);
      });
    }

    // Member counts per team
    const teamIds = teams.map(t => t.id);
    const { data: memberRows } = await supabase
      .from('team_members').select('team_id').in('team_id', teamIds);
    const memberCount = {};
    (memberRows || []).forEach(r => { memberCount[r.team_id] = (memberCount[r.team_id] || 0) + 1; });

    const result = teams.map(t => {
      const teamJobIds = [...(jobToTeams[t.id] || new Set())];
      const teamCands = candidates.filter(c => teamJobIds.includes(c.job_id));
      const scores = teamCands.map(c => Number(c.score || 0)).filter(Boolean);
      return {
        id: t.id,
        name: t.name,
        manager: t.manager?.name || t.manager?.email || '—',
        tl: t.tl?.name || t.tl?.email || '—',
        member_count: memberCount[t.id] || 0,
        submission_count: teamCands.length,
        job_count: teamJobIds.length,
        avg_score: scores.length ? parseFloat((scores.reduce((s, v) => s + v, 0) / scores.length).toFixed(1)) : 0,
      };
    }).sort((a, b) => b.submission_count - a.submission_count);

    res.json({ teams: result });
  } catch (err) {
    logger.error('[Submissions] by-team error: ' + err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/submissions/by-team/:id ────────────────────────────────────────
router.get('/by-team/:id', async (req, res) => {
  const { id: teamId } = req.params;
  const { date_from, date_to } = req.query;
  try {
    const { candidates } = await getScopedPassCandidates(req.user, date_from, date_to);

    // Team detail
    const { data: team } = await supabase
      .from('teams')
      .select('id, name, manager:users!teams_manager_id_fkey(id,name,email), tl:users!teams_tl_id_fkey(id,name,email)')
      .eq('id', teamId).single();
    if (!team) return res.status(404).json({ error: 'Team not found' });

    // Jobs for this team
    const { data: jtRows } = await supabase.from('job_teams').select('job_id').eq('team_id', teamId);
    const teamJobIds = (jtRows || []).map(r => r.job_id);

    const teamCands = candidates.filter(c => teamJobIds.includes(c.job_id));

    // Job breakdown
    let jobDetails = [];
    if (teamJobIds.length) {
      const { data: jobs } = await supabase
        .from('jobs').select('id, job_title, company_name, status').in('id', teamJobIds);
      const jobCounts = {};
      teamCands.forEach(c => { jobCounts[c.job_id] = (jobCounts[c.job_id] || 0) + 1; });
      jobDetails = (jobs || []).map(j => ({
        id: j.id,
        title: j.job_title,
        company: j.company_name,
        status: j.status,
        submission_count: jobCounts[j.id] || 0,
      })).sort((a, b) => b.submission_count - a.submission_count);
    }

    // Members with per-recruiter pass count
    const { data: members } = await supabase
      .from('team_members')
      .select('user_id, role_in_team, user:users!team_members_user_id_fkey(id,name,email,role)')
      .eq('team_id', teamId);
    const recruiterCounts = {};
    teamCands.forEach(c => { recruiterCounts[c.recruiter_id] = (recruiterCounts[c.recruiter_id] || 0) + 1; });
    const membersWithCounts = (members || []).map(m => ({
      id: m.user_id,
      name: m.user?.name || m.user?.email || m.user_id,
      email: m.user?.email || null,
      role: m.user?.role || m.role_in_team,
      submission_count: recruiterCounts[m.user_id] || 0,
    })).sort((a, b) => b.submission_count - a.submission_count);

    // Timeline
    const byDate = {};
    teamCands.forEach(c => {
      const d = c.created_at.slice(0, 10);
      byDate[d] = (byDate[d] || 0) + 1;
    });
    const timeline = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    // Candidate list
    const jobMap = Object.fromEntries(jobDetails.map(j => [j.id, j]));
    const candIds = teamCands.map(c => c.id);
    let enrichedCands = [];
    if (candIds.length) {
      const { data: fullCands } = await supabase
        .from('candidates')
        .select('id, name, email, job_id, recruiter_id, created_at, resume_scores(score, status)')
        .in('id', candIds);
      const memberMap = Object.fromEntries(membersWithCounts.map(m => [m.id, m]));
      enrichedCands = (fullCands || []).map(c => ({
        id: c.id,
        name: c.name || '(name pending)',
        email: c.email,
        score: c.resume_scores?.[0]?.score ?? null,
        job_id: c.job_id,
        job_title: jobMap[c.job_id]?.title || '—',
        recruiter_name: memberMap[c.recruiter_id]?.name || c.recruiter_id,
        submitted_at: c.created_at,
      }));
    }

    const scores = teamCands.map(c => Number(c.score || 0)).filter(Boolean);

    res.json({
      team: { id: team.id, name: team.name, manager: team.manager?.name || team.manager?.email || '—', tl: team.tl?.name || team.tl?.email || '—' },
      kpis: {
        total_submissions: teamCands.length,
        job_count: teamJobIds.length,
        member_count: (members || []).length,
        avg_score: scores.length ? parseFloat((scores.reduce((s, v) => s + v, 0) / scores.length).toFixed(1)) : 0,
      },
      jobs: jobDetails,
      members: membersWithCounts,
      candidates: enrichedCands,
      timeline,
    });
  } catch (err) {
    logger.error('[Submissions] by-team/:id error: ' + err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/submissions/by-job ─────────────────────────────────────────────
router.get('/by-job', async (req, res) => {
  const { date_from, date_to } = req.query;
  try {
    const { candidates, jobIds } = await getScopedPassCandidates(req.user, date_from, date_to);

    if (!jobIds.length) return res.json({ jobs: [] });

    const { data: jobs } = await supabase
      .from('jobs').select('id, job_title, company_name, status, created_at').in('id', jobIds);

    const jobCandMap = {};
    candidates.forEach(c => {
      if (!jobCandMap[c.job_id]) jobCandMap[c.job_id] = { count: 0, scores: [], recruiterIds: new Set() };
      jobCandMap[c.job_id].count++;
      if (c.score != null) jobCandMap[c.job_id].scores.push(Number(c.score));
      if (c.recruiter_id) jobCandMap[c.job_id].recruiterIds.add(c.recruiter_id);
    });

    const result = (jobs || []).map(j => {
      const m = jobCandMap[j.id] || { count: 0, scores: [], recruiterIds: new Set() };
      return {
        id: j.id,
        title: j.job_title,
        company: j.company_name,
        status: j.status,
        submission_count: m.count,
        recruiter_count: m.recruiterIds.size,
        avg_score: m.scores.length
          ? parseFloat((m.scores.reduce((s, v) => s + v, 0) / m.scores.length).toFixed(1))
          : 0,
      };
    }).sort((a, b) => b.submission_count - a.submission_count);

    res.json({ jobs: result });
  } catch (err) {
    logger.error('[Submissions] by-job error: ' + err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/submissions/by-job/:id ─────────────────────────────────────────
router.get('/by-job/:id', async (req, res) => {
  const { id: jobId } = req.params;
  const { date_from, date_to } = req.query;
  try {
    const { candidates } = await getScopedPassCandidates(req.user, date_from, date_to);
    const jobCands = candidates.filter(c => c.job_id === jobId);

    const { data: job } = await supabase
      .from('jobs').select('id, job_title, company_name, status, created_at').eq('id', jobId).single();
    if (!job) return res.status(404).json({ error: 'Job not found' });

    // Recruiter breakdown
    const recruiterIds = [...new Set(jobCands.map(c => c.recruiter_id).filter(Boolean))];
    let recruiterDetails = [];
    if (recruiterIds.length) {
      const { data: users } = await supabase
        .from('users').select('id, name, email').in('id', recruiterIds);
      const userMap = Object.fromEntries((users || []).map(u => [u.id, u]));
      const rCounts = {};
      const rScores = {};
      jobCands.forEach(c => {
        rCounts[c.recruiter_id] = (rCounts[c.recruiter_id] || 0) + 1;
        if (c.score != null) {
          if (!rScores[c.recruiter_id]) rScores[c.recruiter_id] = [];
          rScores[c.recruiter_id].push(Number(c.score));
        }
      });
      recruiterDetails = recruiterIds.map(rid => ({
        id: rid,
        name: userMap[rid]?.name || userMap[rid]?.email || rid,
        email: userMap[rid]?.email || null,
        submission_count: rCounts[rid] || 0,
        avg_score: rScores[rid]?.length
          ? parseFloat((rScores[rid].reduce((s, v) => s + v, 0) / rScores[rid].length).toFixed(1))
          : 0,
      })).sort((a, b) => b.submission_count - a.submission_count);
    }

    // Timeline
    const byDate = {};
    jobCands.forEach(c => {
      const d = c.created_at.slice(0, 10);
      byDate[d] = (byDate[d] || 0) + 1;
    });
    const timeline = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    // Candidate list
    const candIds = jobCands.map(c => c.id);
    let enrichedCands = [];
    if (candIds.length) {
      const { data: fullCands } = await supabase
        .from('candidates')
        .select('id, name, email, recruiter_id, created_at, resume_scores(score, status)')
        .in('id', candIds);
      const rMap = Object.fromEntries(recruiterDetails.map(r => [r.id, r]));
      enrichedCands = (fullCands || []).map(c => ({
        id: c.id,
        name: c.name || '(name pending)',
        email: c.email,
        score: c.resume_scores?.[0]?.score ?? null,
        recruiter_name: rMap[c.recruiter_id]?.name || c.recruiter_id,
        submitted_at: c.created_at,
      }));
    }

    const scores = jobCands.map(c => Number(c.score || 0)).filter(Boolean);

    res.json({
      job: { id: job.id, title: job.job_title, company: job.company_name, status: job.status, created_at: job.created_at },
      kpis: {
        total_submissions: jobCands.length,
        recruiter_count: recruiterIds.length,
        avg_score: scores.length ? parseFloat((scores.reduce((s, v) => s + v, 0) / scores.length).toFixed(1)) : 0,
      },
      recruiters: recruiterDetails,
      candidates: enrichedCands,
      timeline,
    });
  } catch (err) {
    logger.error('[Submissions] by-job/:id error: ' + err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
