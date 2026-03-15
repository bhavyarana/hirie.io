const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');
const logger = require('../config/logger');

// ─── Helper: compute funnel from rows that have resume_scores joined ─────────
function enrichAndFunnel(rows) {
  const enriched = (rows || []).map(c => ({
    ...c,
    score: c.resume_scores?.[0]?.score ?? null,
    score_status: c.resume_scores?.[0]?.status ?? null,
    matched_skills: c.resume_scores?.[0]?.matched_skills ?? [],
  }));
  const completed = enriched.filter(c => c.processing_status === 'completed');
  const pass = completed.filter(c => c.score_status === 'pass').length;
  const review = completed.filter(c => c.score_status === 'review').length;
  const fail = completed.filter(c => c.score_status === 'fail').length;
  const scored = completed.filter(c => c.score !== null);
  const avg = scored.length ? parseFloat((scored.reduce((s, c) => s + Number(c.score), 0) / scored.length).toFixed(1)) : 0;
  return { enriched, completed, pass, review, fail, avg_score: avg, pass_rate: completed.length ? Math.round((pass / completed.length) * 100) : 0 };
}

// ─── GET /api/analytics/dashboard ───────────────────────────────────────────
router.get('/analytics/dashboard', authMiddleware, async (req, res) => {
  const { role, id: userId } = req.user;
  try {
    if (role === 'admin')    return res.json(await adminAnalytics());
    if (role === 'manager')  return res.json(await managerAnalytics(userId));
    if (role === 'tl')       return res.json(await tlAnalytics(userId));
    if (role === 'recruiter') return res.json(await recruiterAnalytics(userId));
    return res.status(403).json({ error: 'No analytics for this role' });
  } catch (err) {
    logger.error('[Analytics] Dashboard error: ' + err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Legacy: GET /api/jobs/:id/analytics ─────────────────────────────────────
router.get('/jobs/:id/analytics', authMiddleware, async (req, res) => {
  const { id: jobId } = req.params;
  const { data: job } = await supabase.from('jobs').select('id, job_title, company_name').eq('id', jobId).single();
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const { data: scores } = await supabase.from('resume_scores')
    .select('score, status, matched_skills, missing_skills, strengths, weaknesses, experience_match, education_match')
    .eq('job_id', jobId);

  if (!scores || scores.length === 0) {
    return res.json({ job, total_candidates: 0, pass_count: 0, review_count: 0, fail_count: 0, average_score: 0, score_distribution: [], top_matched_skills: [], top_missing_skills: [], top_strengths: [] });
  }

  const distribution = Array.from({ length: 10 }, (_, i) => ({ range: `${i * 10}-${i * 10 + 10}`, count: 0 }));
  let totalScore = 0, passCount = 0, reviewCount = 0, failCount = 0;
  const matchedSkillMap = {}, missingSkillMap = {}, strengthMap = {};
  scores.forEach(s => {
    totalScore += parseFloat(s.score || 0);
    if (s.status === 'pass') passCount++;
    else if (s.status === 'review') reviewCount++;
    else failCount++;
    const bucket = Math.min(Math.floor(parseFloat(s.score || 0) / 10), 9);
    distribution[bucket].count++;
    (s.matched_skills || []).forEach(sk => { matchedSkillMap[sk] = (matchedSkillMap[sk] || 0) + 1; });
    (s.missing_skills || []).forEach(sk => { missingSkillMap[sk] = (missingSkillMap[sk] || 0) + 1; });
    (s.strengths || []).forEach(sk => { strengthMap[sk] = (strengthMap[sk] || 0) + 1; });
  });
  const sortByCount = map => Object.entries(map).sort(([, a], [, b]) => b - a).slice(0, 10).map(([skill, count]) => ({ skill, count }));
  res.json({ job, total_candidates: scores.length, pass_count: passCount, review_count: reviewCount, fail_count: failCount, average_score: parseFloat((totalScore / scores.length).toFixed(1)), score_distribution: distribution, top_matched_skills: sortByCount(matchedSkillMap), top_missing_skills: sortByCount(missingSkillMap), top_strengths: sortByCount(strengthMap) });
});

// ═══════════════════════════════════════════════════════════════════════════
//  ADMIN
// ═══════════════════════════════════════════════════════════════════════════
async function adminAnalytics() {
  const [{ data: allTeams }, { data: allJobs }, { data: allCandidates }, { data: allUsers }] = await Promise.all([
    supabase.from('teams').select('id, name, manager_id, tl_id, manager:users!teams_manager_id_fkey(id,name,email), tl:users!teams_tl_id_fkey(id,name,email)'),
    supabase.from('jobs').select('id, job_title, company_name, status, created_by, created_at'),
    supabase.from('candidates').select('id, job_id, recruiter_id, processing_status, created_at, resume_scores(score, status)'),
    supabase.from('users').select('id, name, email, role'),
  ]);

  const teams = allTeams || [], jobs = allJobs || [], users = allUsers || [];
  const { enriched: enrichedCands, completed, pass, review, fail, avg_score, pass_rate } = enrichAndFunnel(allCandidates);

  const managers = users.filter(u => u.role === 'manager');
  const managerStats = managers.map(m => {
    const managerJobs = jobs.filter(j => j.created_by === m.id);
    const managerCands = enrichedCands.filter(c => managerJobs.some(j => j.id === c.job_id) && c.processing_status === 'completed');
    const f = enrichAndFunnel(managerCands.map(c => ({ ...c, resume_scores: [{ score: c.score, status: c.score_status }] })));
    return { id: m.id, name: m.name || m.email, email: m.email, teams_count: teams.filter(t => t.manager_id === m.id).length, jobs_count: managerJobs.length, candidates_total: managerCands.length, pass_rate: f.pass_rate, avg_score: f.avg_score };
  }).sort((a, b) => b.candidates_total - a.candidates_total);

  const teamStats = teams.map(t => {
    const mgJobs = jobs.filter(j => j.created_by === t.manager_id);
    const tc = enrichedCands.filter(c => mgJobs.some(j => j.id === c.job_id) && c.processing_status === 'completed');
    const f = enrichAndFunnel(tc.map(c => ({ ...c, resume_scores: [{ score: c.score, status: c.score_status }] })));
    return { id: t.id, name: t.name, manager: t.manager?.name || t.manager?.email || '—', tl: t.tl?.name || t.tl?.email || '—', candidates_total: tc.length, pass_rate: f.pass_rate, avg_score: f.avg_score };
  }).sort((a, b) => b.candidates_total - a.candidates_total);

  return {
    role: 'admin',
    kpis: { total_teams: teams.length, total_managers: managers.length, total_tls: users.filter(u => u.role === 'tl').length, total_recruiters: users.filter(u => u.role === 'recruiter').length, total_jobs: jobs.length, active_jobs: jobs.filter(j => j.status === 'active').length, total_candidates: (allCandidates || []).length, processed_candidates: completed.length, overall_pass_rate: pass_rate, overall_avg_score: avg_score, pass, review, fail },
    manager_stats: managerStats,
    team_stats: teamStats,
    hiring_funnel: [{ name: 'Pass', value: pass, color: '#22c55e' }, { name: 'Review', value: review, color: '#f59e0b' }, { name: 'Fail', value: fail, color: '#ef4444' }],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  MANAGER
// ═══════════════════════════════════════════════════════════════════════════
async function managerAnalytics(userId) {
  const [{ data: myTeams }, { data: myJobs }, { data: allUsers }] = await Promise.all([
    supabase.from('teams').select('id, name').eq('manager_id', userId),
    supabase.from('jobs').select('id, job_title, status, created_at').eq('created_by', userId),
    supabase.from('users').select('id, name, email, role'),
  ]);

  const teams = myTeams || [], jobs = myJobs || [], users = allUsers || [];
  const jobIds = jobs.map(j => j.id);

  const { data: rawCands } = jobIds.length
    ? await supabase.from('candidates').select('id, job_id, recruiter_id, processing_status, created_at, resume_scores(score, status)').in('job_id', jobIds)
    : { data: [] };

  const { enriched, pass, review, fail, avg_score, pass_rate, completed } = enrichAndFunnel(rawCands);

  const jobStats = jobs.map(j => {
    const jc = enriched.filter(c => c.job_id === j.id && c.processing_status === 'completed');
    const f = enrichAndFunnel(jc.map(c => ({ ...c, resume_scores: [{ score: c.score, status: c.score_status }] })));
    return { id: j.id, title: j.job_title, status: j.status, total: jc.length, pass: f.pass, review: f.review, fail: f.fail, pass_rate: f.pass_rate, avg_score: f.avg_score };
  }).sort((a, b) => b.total - a.total);

  const recruiterIds = [...new Set(enriched.map(c => c.recruiter_id).filter(Boolean))];
  const recruiterStats = recruiterIds.map(rid => {
    const u = users.find(u => u.id === rid);
    const rc = enriched.filter(c => c.recruiter_id === rid && c.processing_status === 'completed');
    const f = enrichAndFunnel(rc.map(c => ({ ...c, resume_scores: [{ score: c.score, status: c.score_status }] })));
    return { id: rid, name: u?.name || u?.email || rid, total: rc.length, pass: f.pass, review: f.review, fail: f.fail, pass_rate: f.pass_rate, avg_score: f.avg_score };
  }).sort((a, b) => b.total - a.total);

  return {
    role: 'manager',
    kpis: { total_teams: teams.length, total_jobs: jobs.length, active_jobs: jobs.filter(j => j.status === 'active').length, total_candidates: (rawCands || []).length, processed: completed.length, pass_rate, avg_score, pass, review, fail },
    job_stats: jobStats,
    recruiter_stats: recruiterStats,
    hiring_funnel: [{ name: 'Pass', value: pass, color: '#22c55e' }, { name: 'Review', value: review, color: '#f59e0b' }, { name: 'Fail', value: fail, color: '#ef4444' }],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  TL
// ═══════════════════════════════════════════════════════════════════════════
async function tlAnalytics(userId) {
  const { data: myTeams } = await supabase.from('teams').select('id, name').eq('tl_id', userId);
  const teams = myTeams || [];
  if (!teams.length) return { role: 'tl', kpis: { total_jobs: 0, total_candidates: 0, processed: 0, pass_rate: 0, avg_score: 0, pass: 0, review: 0, fail: 0 }, job_stats: [], recruiter_stats: [], hiring_funnel: [], top_candidates: [] };

  const teamIds = teams.map(t => t.id);
  const { data: jtRows } = await supabase.from('job_teams').select('job_id').in('team_id', teamIds);
  const jobIds = (jtRows || []).map(r => r.job_id);
  if (!jobIds.length) return { role: 'tl', kpis: { total_jobs: 0, total_candidates: 0, processed: 0, pass_rate: 0, avg_score: 0, pass: 0, review: 0, fail: 0 }, job_stats: [], recruiter_stats: [], hiring_funnel: [], top_candidates: [] };

  const [{ data: jobs }, { data: rawCands }, { data: members }] = await Promise.all([
    supabase.from('jobs').select('id, job_title, status').in('id', jobIds),
    supabase.from('candidates').select('id, job_id, recruiter_id, processing_status, name, resume_file_name, created_at, resume_scores(score, status)').in('job_id', jobIds),
    supabase.from('team_members').select('user_id, users!team_members_user_id_fkey(id,name,email)').in('team_id', teamIds),
  ]);

  const jobList = jobs || [];
  const { enriched, pass, review, fail, avg_score, pass_rate, completed } = enrichAndFunnel(rawCands);

  const jobStats = jobList.map(j => {
    const jc = enriched.filter(c => c.job_id === j.id && c.processing_status === 'completed');
    const f = enrichAndFunnel(jc.map(c => ({ ...c, resume_scores: [{ score: c.score, status: c.score_status }] })));
    return { id: j.id, title: j.job_title, status: j.status, total: jc.length, pass: f.pass, review: f.review, fail: f.fail, pass_rate: f.pass_rate, avg_score: f.avg_score };
  }).sort((a, b) => b.total - a.total);

  const memberMap = {};
  (members || []).forEach(m => { memberMap[m.user_id] = m.users; });
  const recruiterIds = [...new Set(enriched.map(c => c.recruiter_id).filter(Boolean))];
  const recruiterStats = recruiterIds.map(rid => {
    const u = memberMap[rid];
    const rc = enriched.filter(c => c.recruiter_id === rid && c.processing_status === 'completed');
    const f = enrichAndFunnel(rc.map(c => ({ ...c, resume_scores: [{ score: c.score, status: c.score_status }] })));
    return { id: rid, name: u?.name || u?.email || rid, total: rc.length, pass: f.pass, review: f.review, fail: f.fail, pass_rate: f.pass_rate, avg_score: f.avg_score };
  }).sort((a, b) => b.total - a.total);

  const topCandidates = enriched.filter(c => c.score !== null && c.processing_status === 'completed')
    .sort((a, b) => Number(b.score) - Number(a.score)).slice(0, 5)
    .map(c => ({ id: c.id, name: c.name || c.resume_file_name, score: Number(c.score), score_status: c.score_status, job: jobList.find(j => j.id === c.job_id)?.job_title || '—' }));

  return {
    role: 'tl',
    kpis: { total_jobs: jobList.length, total_candidates: (rawCands || []).length, processed: completed.length, pass_rate, avg_score, pass, review, fail },
    job_stats: jobStats,
    recruiter_stats: recruiterStats,
    hiring_funnel: [{ name: 'Pass', value: pass, color: '#22c55e' }, { name: 'Review', value: review, color: '#f59e0b' }, { name: 'Fail', value: fail, color: '#ef4444' }],
    top_candidates: topCandidates,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  RECRUITER
// ═══════════════════════════════════════════════════════════════════════════
async function recruiterAnalytics(userId) {
  const { data: rawCands } = await supabase.from('candidates')
    .select('id, job_id, processing_status, name, resume_file_name, created_at, resume_scores(score, status, matched_skills), jobs!candidates_job_id_fkey(id, job_title, company_name)')
    .eq('recruiter_id', userId).order('created_at', { ascending: false });

  const { enriched, pass, review, fail, avg_score, pass_rate, completed } = enrichAndFunnel(rawCands);

  const jobMap = {};
  enriched.filter(c => c.processing_status === 'completed').forEach(c => {
    const jid = c.job_id;
    if (!jobMap[jid]) jobMap[jid] = { id: jid, title: c.jobs?.job_title || '—', company: c.jobs?.company_name || '—', cands: [] };
    jobMap[jid].cands.push(c);
  });
  const jobStats = Object.values(jobMap).map(j => {
    const f = enrichAndFunnel(j.cands.map(c => ({ ...c, resume_scores: [{ score: c.score, status: c.score_status }] })));
    return { id: j.id, title: j.title, company: j.company, total: j.cands.length, pass: f.pass, review: f.review, fail: f.fail, pass_rate: f.pass_rate, avg_score: f.avg_score };
  }).sort((a, b) => b.total - a.total);

  const skillMap = {};
  enriched.filter(c => c.processing_status === 'completed').forEach(c => (c.matched_skills || []).forEach(s => { skillMap[s] = (skillMap[s] || 0) + 1; }));
  const topSkills = Object.entries(skillMap).sort(([, a], [, b]) => b - a).slice(0, 10).map(([skill, count]) => ({ skill, count }));

  const recentUploads = enriched.slice(0, 5).map(c => ({ id: c.id, name: c.name || c.resume_file_name, score: c.score, score_status: c.score_status, processing_status: c.processing_status, job: c.jobs?.job_title || '—', date: c.created_at }));

  return {
    role: 'recruiter',
    kpis: { total_uploaded: (rawCands || []).length, processed: completed.length, pass_rate, avg_score, pass, review, fail, jobs_active: jobStats.length },
    job_stats: jobStats,
    top_skills: topSkills,
    recent_uploads: recentUploads,
    hiring_funnel: [{ name: 'Pass', value: pass, color: '#22c55e' }, { name: 'Review', value: review, color: '#f59e0b' }, { name: 'Fail', value: fail, color: '#ef4444' }],
  };
}

module.exports = router;
