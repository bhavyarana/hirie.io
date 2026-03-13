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
 * admin: any job
 * manager: jobs in their teams or created by them
 * recruiter: jobs in teams they belong to
 * tl: jobs in their team (read-only; TLs don't upload)
 */
async function canUploadToJob(user, job) {
  const { role, id: userId } = user;
  if (role === 'admin') return true;

  if (role === 'manager') {
    if (job.created_by === userId) return true;
    if (!job.assigned_team_id) return false;
    const { data: team } = await supabase
      .from('teams').select('id').eq('id', job.assigned_team_id).eq('manager_id', userId).single();
    return !!team;
  }

  if (role === 'recruiter') {
    if (!job.assigned_team_id) return false;
    const { data: mem } = await supabase
      .from('team_members').select('id').eq('team_id', job.assigned_team_id).eq('user_id', userId).single();
    return !!mem;
  }

  return false;
}

// POST /api/jobs/:id/upload — Batch upload resumes
router.post('/jobs/:id/upload', authMiddleware, upload.array('resumes', 100), async (req, res) => {
  const { id: jobId } = req.params;
  const recruiterId = req.user.id;

  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('id, job_description_text, job_title, assigned_team_id, created_by')
    .eq('id', jobId)
    .single();

  if (jobError || !job) {
    return res.status(404).json({ error: 'Job not found' });
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
          }, { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 100, removeOnFail: 50 });

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
    // Notify TL of the team about new uploads
    if (job.assigned_team_id) {
      const { data: team } = await supabase.from('teams').select('tl_id, name').eq('id', job.assigned_team_id).single();
      if (team?.tl_id && team.tl_id !== recruiterId) {
        await logActivity(
          recruiterId, 'resumes_uploaded', 'job', jobId,
          { count: results.length, job_title: job.job_title },
          [team.tl_id],
          'Resumes uploaded',
          `${results.length} resume(s) uploaded to job "${job.job_title}".`
        );
      }
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

// GET /api/jobs/:id/candidates — role-scoped
router.get('/jobs/:id/candidates', authMiddleware, async (req, res) => {
  const { id: jobId } = req.params;
  const { status, page = 1, limit = 50 } = req.query;
  const { role, id: userId } = req.user;

  // Verify job access (simplified: check job exists and user role)
  const { data: job } = await supabase.from('jobs').select('id, assigned_team_id, created_by').eq('id', jobId).single();
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

  // Recruiter only sees own candidates
  if (role === 'recruiter') {
    query = query.eq('recruiter_id', userId);
  }
  // TL, manager, admin see all candidates for this job (RLS handles deeper)

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

  await logActivity(
    req.user.id, `candidate_${status}`, 'candidate', req.params.id,
    { status, job_id: data.job_id },
    [data.recruiter_id],
    'Candidate status updated',
    `Your candidate has been marked as "${status}".`
  );

  logger.info(`Candidate ${req.params.id} status updated to ${status} by ${req.user.id}`);
  res.json({ candidate: data });
});

module.exports = router;
