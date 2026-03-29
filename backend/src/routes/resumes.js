const express = require('express');
const router = express.Router();
const multer = require('multer');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const resumeQueue = require('../queues/resumeQueue');
const { logActivity } = require('../services/activityLogger');
const logger = require('../config/logger');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 100 },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
    ];
    cb(null, allowedMimes.includes(file.mimetype));
  },
});

/** Wraps a promise with a timeout */
const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Upload timed out after ${ms / 1000}s`)), ms)),
  ]);

/**
 * Check if the user has access to upload to this job.
 * admin   → always
 * manager → created the job OR manages any team assigned to the job
 * tl      → their team is assigned to the job (via job_teams)
 * recruiter → they are a member of any team assigned to the job
 */
async function canUploadToJob(user, job) {
  const { role, id: userId } = user;
  const jobId = job.id;

  if (role === 'admin') return true;

  if (role === 'manager') {
    if (job.created_by === userId) return true;
    // Check via job_teams (multi-team)
    const { data: jt } = await supabase
      .from('job_teams').select('team_id, teams!job_teams_team_id_fkey(manager_id)')
      .eq('job_id', jobId);
    return (jt || []).some(r => r.teams?.manager_id === userId);
  }

  if (role === 'tl') {
    // TL can upload if their team is assigned to this job
    const { data: myTeams } = await supabase.from('teams').select('id').eq('tl_id', userId);
    if (!myTeams?.length) return false;
    const myTeamIds = myTeams.map(t => t.id);
    const { data: jt } = await supabase.from('job_teams').select('team_id').eq('job_id', jobId).in('team_id', myTeamIds);
    return !!(jt?.length);
  }

  if (role === 'recruiter') {
    // Recruiter must be explicitly assigned to this job via job_recruiter_assignments
    const { data: assignment } = await supabase
      .from('job_recruiter_assignments')
      .select('recruiter_id')
      .eq('job_id', jobId)
      .eq('recruiter_id', userId)
      .maybeSingle();
    return !!assignment;
  }

  return false;
}

/**
 * Insert a new row into talent_pool when a resume is uploaded.
 * Dedup strategy:
 *   - Email is the unique key (partial index on NON-NULL emails)
 *   - At upload time email is unknown → insert by resume_hash
 *   - If another row with same resume_hash already exists → skip (already in pool)
 *   - Later the worker updates name/email/skills once AI extracts them
 */
async function upsertTalentPool(candidateId, file, resumeHash, storagePath, recruiterId, job) {
  try {
    // Check if already in talent pool by hash
    const { data: existing } = await supabase
      .from('talent_pool')
      .select('id')
      .eq('resume_hash', resumeHash)
      .maybeSingle();

    if (existing) {
      // Already in pool — no action needed
      return;
    }

    await supabase.from('talent_pool').insert({
      candidate_id: candidateId,
      resume_file_path: storagePath,
      resume_file_name: file.originalname,
      resume_hash: resumeHash,
      uploaded_by: recruiterId,
      first_seen_job_id: job.id,
      first_seen_job_title: job.job_title,
    });
  } catch (err) {
    // Non-fatal: log and continue
    logger.warn(`[TalentPool] Failed to upsert for candidate ${candidateId}: ${err.message}`);
  }
}

/**
 * Returns the set of supervisor user IDs who should receive notifications
 * about activity on a job: TL of each assigned team, team managers, and all admins.
 * Excludes the acting user (excludeUserId) to avoid self-notifications.
 */
async function getJobSupervisors(jobId, excludeUserId = null) {
  const supervisorIds = new Set();

  // TL and manager of each team assigned to this job
  const { data: jtRows } = await supabase
    .from('job_teams')
    .select('team_id, team:teams!job_teams_team_id_fkey(tl_id, manager_id)')
    .eq('job_id', jobId);

  for (const row of (jtRows || [])) {
    if (row.team?.tl_id) supervisorIds.add(row.team.tl_id);
    if (row.team?.manager_id) supervisorIds.add(row.team.manager_id);
  }

  // All admins always get notified
  const { data: admins } = await supabase.from('users').select('id').eq('role', 'admin');
  for (const a of (admins || [])) supervisorIds.add(a.id);

  if (excludeUserId) supervisorIds.delete(excludeUserId);
  return [...supervisorIds];
}

// GET /api/candidates/my-count — count of candidates uploaded by the current user
router.get('/candidates/my-count', authMiddleware, async (req, res) => {
  const { count, error } = await supabase
    .from('candidates')
    .select('*', { count: 'exact', head: true })
    .eq('recruiter_id', req.user.id);

  if (error) {
    logger.error('Error fetching my-count:', error);
    return res.status(500).json({ error: error.message });
  }

  res.json({ count: count ?? 0 });
});

// POST /api/jobs/:id/upload — Batch upload resumes
router.post('/jobs/:id/upload', authMiddleware, upload.array('resumes', 100), async (req, res) => {

  const { id: jobId } = req.params;
  const recruiterId = req.user.id;

  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('id, job_description_text, job_title, assigned_team_id, created_by, status')
    .eq('id', jobId)
    .single();

  if (jobError || !job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  // Block uploads to non-active jobs for recruiters & TLs
  const { role: userRole } = req.user;
  if (job.status !== 'active' && userRole !== 'admin' && userRole !== 'manager') {
    return res.status(403).json({
      error: `This job is ${job.status}. Resume uploads are disabled for ${job.status} jobs.`,
    });
  }

  // Check upload permission
  const hasAccess = await canUploadToJob(req.user, job);
  if (!hasAccess) {
    return res.status(403).json({ error: 'You do not have permission to upload to this job' });
  }

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  logger.info(`[Upload] ${req.files.length} file(s) received for job ${jobId} by ${req.user.role} ${recruiterId}`);

  // Ensure the storage bucket exists
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.some(b => b.name === 'resumes')) {
      logger.warn('[Upload] Creating missing "resumes" bucket…');
      await supabase.storage.createBucket('resumes', {
        public: false,
        fileSizeLimit: 20971520,
        allowedMimeTypes: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'],
      });
    }
  } catch (err) {
    logger.warn(`[Upload] Bucket check skipped: ${err.message}`);
  }

  // Process ALL files concurrently, each with a 30s timeout
  const settled = await Promise.allSettled(
    req.files.map((file) =>
      withTimeout(
        (async () => {
          const candidateId = uuidv4();
          const ext = file.originalname.split('.').pop().toLowerCase();
          // Path per spec: resumes/{job_id}/{candidate_id}.ext
          const storagePath = `${jobId}/${candidateId}.${ext}`;

          // Compute SHA-256 hash for duplicate detection
          const resumeHash = crypto.createHash('sha256').update(file.buffer).digest('hex');

          // Check for duplicate hash within this job
          const { data: existing } = await supabase
            .from('candidates')
            .select('id, resume_file_name')
            .eq('job_id', jobId)
            .eq('resume_hash', resumeHash)
            .single();

          if (existing) {
            throw new Error(`Duplicate resume detected (matches "${existing.resume_file_name}")`);
          }

          logger.info(`[Upload] "${file.originalname}" (${(file.size / 1024).toFixed(0)} KB)`);

          // 1. Upload to Supabase Storage
          const { data: storageData, error: storageError } = await supabase.storage
            .from('resumes')
            .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false });

          if (storageError) {
            throw new Error(`Storage upload failed: ${storageError.message}`);
          }

          // 2. Insert candidate record
          const { data: candidate, error: candidateError } = await supabase
            .from('candidates')
            .insert({
              id: candidateId,
              job_id: jobId,
              recruiter_id: recruiterId,
              resume_file_path: storagePath,
              resume_file_name: file.originalname,
              resume_hash: resumeHash,
              processing_status: 'pending',
              status: 'uploaded',
            })
            .select()
            .single();

          if (candidateError) {
            await supabase.storage.from('resumes').remove([storagePath]).catch(() => {});
            throw new Error(`DB insert failed: ${candidateError.message}`);
          }

          // 3. Enqueue AI processing job
          await resumeQueue.add('process-resume', {
            candidateId: candidate.id,
            jobId,
            recruiterId,
            storagePath,
            fileName: file.originalname,
            jobDescription: job.job_description_text,
            jobTitle: job.job_title,
            scoringCriteria: job.scoring_criteria || null,
          }, { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 100, removeOnFail: 50 });

          // 4. Add to talent pool (email dedup handled inside)
          await upsertTalentPool(candidate.id, file, resumeHash, storagePath, recruiterId, job);

          logger.info(`[Upload] ✓ Queued: "${file.originalname}" → ${candidate.id}`);
          return { candidateId: candidate.id, fileName: file.originalname, status: 'queued' };
        })(),
        30000
      )
    )
  );

  const results = settled.filter(s => s.status === 'fulfilled').map(s => s.value);
  const errors = settled
    .map((s, i) => s.status === 'rejected'
      ? { fileName: req.files[i].originalname, error: s.reason?.message || 'Unknown error' }
      : null)
    .filter(Boolean);

  logger.info(`[Upload] Done: ${results.length}/${req.files.length} succeeded, ${errors.length} failed`);

  if (results.length > 0) {
    // Notify TL, team manager, and all admins about new uploads
    const supervisors = await getJobSupervisors(jobId, recruiterId);
    if (supervisors.length > 0) {
      const { data: uploader } = await supabase.from('users').select('name, email').eq('id', recruiterId).single();
      const uploaderName = uploader?.name || uploader?.email || 'A recruiter';

      await logActivity(
        recruiterId, 'resumes_uploaded', 'job', jobId,
        { count: results.length, job_title: job.job_title, uploaded_by: uploaderName },
        supervisors,
        `${uploaderName} uploaded ${results.length} resume(s)`,
        `${uploaderName} uploaded ${results.length} resume(s) to job "${job.job_title}".`
      );
    }
  }



  if (results.length === 0) {
    return res.status(500).json({ error: errors[0]?.error || 'All uploads failed', errors });
  }

  res.status(202).json({
    message: `${results.length} of ${req.files.length} resume(s) queued`,
    queued: results,
    errors,
  });
});

// GET /api/jobs/:id/candidates — all roles see ALL candidates for the job
// Optional ?mine=true → restrict to current user's uploads only (used by "My Candidates" page)
router.get('/jobs/:id/candidates', authMiddleware, async (req, res) => {
  const { id: jobId } = req.params;
  const { status, page = 1, limit = 50, mine } = req.query;
  const { id: userId } = req.user;

  // Verify job exists
  const { data: job } = await supabase.from('jobs').select('id').eq('id', jobId).single();
  if (!job) return res.status(404).json({ error: 'Job not found' });

  let query = supabase
    .from('candidates')
    .select(`
      *,
      resume_scores(score, status, matched_skills, missing_skills, summary, strengths, weaknesses, experience_match, education_match),
      recruiter:users!candidates_recruiter_id_fkey(id, name, email)
    `)
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  // ?mine=true → restrict to the current user's uploads ("My Candidates" page)
  if (mine === 'true') {
    query = query.eq('recruiter_id', userId);
  }
  // All roles see all candidates by default

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: 'Failed to fetch candidates' });

  const candidates = (data || []).map(c => ({
    ...c,
    score: c.resume_scores?.[0]?.score ?? null,
    score_status: c.resume_scores?.[0]?.status ?? null,
    matched_skills: c.resume_scores?.[0]?.matched_skills ?? [],
    missing_skills: c.resume_scores?.[0]?.missing_skills ?? [],
    summary: c.resume_scores?.[0]?.summary ?? null,
    strengths: c.resume_scores?.[0]?.strengths ?? [],
    weaknesses: c.resume_scores?.[0]?.weaknesses ?? [],
    experience_match: c.resume_scores?.[0]?.experience_match ?? null,
    education_match: c.resume_scores?.[0]?.education_match ?? null,
    recruiter_name: c.recruiter?.name || c.recruiter?.email || null,
    resume_scores: undefined,
    recruiter: undefined,
  }));

  const filtered = status ? candidates.filter(c => c.score_status === status) : candidates;
  res.json({ candidates: filtered, total: filtered.length });
});

// GET /api/candidates/search — keyword + filter search across all processed candidates (all roles)
router.get('/candidates/search', authMiddleware, async (req, res) => {
  const { q = '', min_exp, max_exp, score_status, page = 1, limit = 24 } = req.query;
  const { role, id: userId } = req.user;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    let query = supabase
      .from('candidates')
      .select(`
        id, name, email, phone, resume_file_path, resume_file_name,
        extracted_skills, extracted_titles, experience_years, current_location,
        processing_status, created_at,
        job:jobs!candidates_job_id_fkey(id, job_title, company_name),
        resume_scores(score, status, matched_skills, summary)
      `, { count: 'exact' })
      .eq('processing_status', 'completed')
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    // Recruiters only see their own uploads
    if (role === 'recruiter') query = query.eq('recruiter_id', userId);

    // Keyword — match name OR skills array OR titles array
    if (q && q.trim()) {
      const kw = q.trim();
      query = query.or(`name.ilike.%${kw}%,extracted_skills.cs.{${kw}},extracted_titles.cs.{${kw}}`);
    }

    // Experience filter
    if (min_exp) query = query.gte('experience_years', parseFloat(min_exp));
    if (max_exp) query = query.lte('experience_years', parseFloat(max_exp));

    const { data, error, count } = await query;
    if (error) {
      logger.error('Candidate search error:', error);
      return res.status(500).json({ error: 'Search failed', detail: error.message });
    }

    let results = (data || []).map(c => {
      const s = c.resume_scores?.[0];
      return {
        id: c.id, name: c.name, email: c.email, phone: c.phone,
        resume_file_path: c.resume_file_path, resume_file_name: c.resume_file_name,
        extracted_skills: c.extracted_skills || [],
        extracted_titles: c.extracted_titles || [],
        experience_years: c.experience_years,
        current_location: c.current_location,
        processing_status: c.processing_status,
        created_at: c.created_at,
        job: c.job,
        score: s?.score ?? null,
        score_status: s?.status ?? null,
        matched_skills: s?.matched_skills ?? [],
        summary: s?.summary ?? null,
      };
    });

    // Filter by score_status in JS (joined table)
    if (score_status && score_status !== 'all') {
      results = results.filter(r => r.score_status === score_status);
    }

    res.json({ candidates: results, total: count || 0, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    logger.error('Candidate search error:', err);
    res.status(500).json({ error: 'Unexpected error during search' });
  }
});

// GET /api/candidates/:id
router.get('/candidates/:id', authMiddleware, async (req, res) => {
  const { role, id: userId } = req.user;

  let query = supabase
    .from('candidates')
    .select('*, jobs(id, job_title, company_name), resume_scores(*), recruiter:users!candidates_recruiter_id_fkey(id, name, email)')
    .eq('id', req.params.id);

  // Recruiter can only see their own
  if (role === 'recruiter') {
    query = query.eq('recruiter_id', userId);
  }

  const { data, error } = await query.single();

  if (error || !data) return res.status(404).json({ error: 'Candidate not found' });

  const { data: signedUrl } = await supabase.storage
    .from('resumes').createSignedUrl(data.resume_file_path, 3600);

  res.json({
    candidate: {
      ...data,
      job: data.jobs,
      score_data: data.resume_scores?.[0] ?? null,
      resume_download_url: signedUrl?.signedUrl ?? null,
      recruiter_name: data.recruiter?.name || data.recruiter?.email || null,
      jobs: undefined,
      resume_scores: undefined,
      recruiter: undefined,
    },
  });
});

// PATCH /api/candidates/:id/status — TL, manager, admin can update pipeline status
router.patch('/candidates/:id/status', authMiddleware, requireRole('admin', 'manager', 'tl'), async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['uploaded', 'scored', 'shortlisted', 'interview', 'rejected'];

  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
  }

  const { data, error } = await supabase
    .from('candidates')
    .update({ status })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error || !data) return res.status(404).json({ error: 'Candidate not found or update failed' });

  // Notify recruiter (if they didn't make the change) + all supervisors
  const notifyIds = new Set();
  if (data.recruiter_id && data.recruiter_id !== req.user.id) notifyIds.add(data.recruiter_id);
  const supervisors = await getJobSupervisors(data.job_id, req.user.id);
  supervisors.forEach(id => notifyIds.add(id));
  notifyIds.delete(req.user.id);

  if (notifyIds.size > 0) {
    const actorName = req.user.name || req.user.email || 'Someone';
    await logActivity(
      req.user.id, `candidate_${status}`, 'candidate', req.params.id,
      { status, job_id: data.job_id },
      [...notifyIds],
      `Candidate marked as "${status}"`,
      `${actorName} marked a candidate as "${status}".`
    );
  }

  logger.info(`Candidate ${req.params.id} status updated to ${status} by ${req.user.id}`);
  res.json({ candidate: data });
});

// PATCH /api/candidates/:id/hiring-status — recruiter, TL, manager, admin can update hiring progress
const VALID_HIRING_STATUSES = [
  'client_screening',
  'interview_l1',
  'interview_l2',
  'interview_l3',
  'job_offered',
  'rejected',
  'joined',
  'backout',
  'duplicate',
];

router.patch('/candidates/:id/hiring-status', authMiddleware, requireRole('admin', 'manager', 'tl', 'recruiter'), async (req, res) => {
  const { hiring_status, rejection_reason, hiring_feedback } = req.body;

  if (!hiring_status || !VALID_HIRING_STATUSES.includes(hiring_status)) {
    return res.status(400).json({ error: `hiring_status must be one of: ${VALID_HIRING_STATUSES.join(', ')}` });
  }

  const updates = {
    hiring_status,
    hiring_feedback: hiring_feedback || null,
    rejection_reason: hiring_status === 'rejected' ? (rejection_reason || null) : null,
  };

  // First fetch the candidate to check ownership
  const { data: existing } = await supabase
    .from('candidates')
    .select('id, recruiter_id, job_id, name, job:jobs!candidates_job_id_fkey(job_title)')
    .eq('id', req.params.id)
    .single();

  if (!existing) return res.status(404).json({ error: 'Candidate not found' });

  // Recruiters and TLs can only update candidates they personally uploaded
  const { role, id: userId } = req.user;
  if (role === 'recruiter' || role === 'tl') {
    if (existing.recruiter_id !== userId) {
      return res.status(403).json({ error: 'You can only update hiring status for candidates you uploaded' });
    }
  }

  const { data, error } = await supabase
    .from('candidates')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error || !data) return res.status(404).json({ error: 'Candidate not found or update failed' });


  // Notify recruiter (if different from actor) + all job supervisors
  const notifyIds = new Set();
  if (data.recruiter_id && data.recruiter_id !== req.user.id) notifyIds.add(data.recruiter_id);
  const supervisors = await getJobSupervisors(data.job_id, req.user.id);
  supervisors.forEach(id => notifyIds.add(id));
  notifyIds.delete(req.user.id);

  if (notifyIds.size > 0) {
    const actorName = req.user.name || req.user.email || 'Someone';
    const statusLabel = hiring_status.replace(/_/g, ' ');
    const candidateName = existing.name || data.name || 'A candidate';
    const jobTitle = existing.job?.job_title || 'a job';
    const reasonSuffix = updates.rejection_reason ? ` (Reason: ${updates.rejection_reason})` : '.';
    await logActivity(
      req.user.id, `hiring_status_${hiring_status}`, 'candidate', req.params.id,
      { hiring_status, rejection_reason: updates.rejection_reason },
      [...notifyIds],
      `"${candidateName}" status → "${statusLabel}"`,
      `${actorName} updated ${candidateName}'s hiring status to "${statusLabel}" for job "${jobTitle}"${reasonSuffix}`
    );
  }

  logger.info(`Candidate ${req.params.id} hiring_status updated to ${hiring_status} by ${req.user.id}`);
  res.json({ candidate: data });
});

// POST /api/candidates/:id/reprocess — re-queue an already-processed candidate (admin/manager/tl)
router.post('/candidates/:id/reprocess', authMiddleware, async (req, res) => {
  const candidateId = req.params.id;

  const { data: candidate, error } = await supabase
    .from('candidates')
    .select('*, job:jobs!candidates_job_id_fkey(id, job_title, job_description_text, scoring_criteria)')
    .eq('id', candidateId)
    .single();

  if (error || !candidate) {
    return res.status(404).json({ error: 'Candidate not found' });
  }

  // Reset processing state
  await supabase.from('candidates').update({
    processing_status: 'pending',
    name: null,
    email: null,
    phone: null,
    error_message: null,
  }).eq('id', candidateId);

  // Re-queue
  await resumeQueue.add('process-resume', {
    candidateId: candidate.id,
    jobId: candidate.job_id,
    recruiterId: candidate.recruiter_id,
    storagePath: candidate.resume_file_path,
    fileName: candidate.resume_file_name,
    jobDescription: candidate.job?.job_description_text || '',
    jobTitle: candidate.job?.job_title || '',
    scoringCriteria: candidate.job?.scoring_criteria || null,
  }, { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 100, removeOnFail: 50 });

  logger.info(`[Reprocess] Queued candidate ${candidateId} for re-processing`);
  res.json({ message: 'Re-queued for processing', candidateId });
});

// DELETE /api/candidates/:id — remove candidate + storage file + talent pool entry
router.delete('/candidates/:id', authMiddleware, async (req, res) => {
  const candidateId = req.params.id;

  const { data: candidate, error } = await supabase
    .from('candidates')
    .select('id, resume_file_path, resume_hash')
    .eq('id', candidateId)
    .single();

  if (error || !candidate) {
    return res.status(404).json({ error: 'Candidate not found' });
  }

  // 1. Delete from storage (non-fatal)
  if (candidate.resume_file_path) {
    await supabase.storage.from('resumes').remove([candidate.resume_file_path]).catch(err =>
      logger.warn(`[Delete] Storage cleanup failed for ${candidateId}: ${err.message}`)
    );
  }

  // 2. Remove talent pool entry matched by resume_hash (non-fatal)
  if (candidate.resume_hash) {
    try {
      await supabase.from('talent_pool').delete().eq('resume_hash', candidate.resume_hash);
    } catch (err) {
      logger.warn(`[Delete] Talent pool cleanup failed for ${candidateId}: ${err.message}`);
    }
  }

  // 3. Delete candidate row (cascades resume_scores via FK)
  const { error: deleteError } = await supabase.from('candidates').delete().eq('id', candidateId);
  if (deleteError) {
    return res.status(500).json({ error: `Failed to delete candidate: ${deleteError.message}` });
  }

  logger.info(`[Delete] Candidate ${candidateId} deleted (storage + talent pool cleaned up)`);
  res.json({ message: 'Candidate deleted' });
});

module.exports = router;

