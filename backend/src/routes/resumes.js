const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');
const resumeQueue = require('../queues/resumeQueue');
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

// POST /api/jobs/:id/upload — Batch upload resumes
router.post('/jobs/:id/upload', authMiddleware, upload.array('resumes', 100), async (req, res) => {
  const { id: jobId } = req.params;
  const recruiterId = req.user.id;

  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('id, job_description_text, job_title')
    .eq('id', jobId)
    .eq('recruiter_id', recruiterId)
    .single();

  if (jobError || !job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  logger.info(`[Upload] ${req.files.length} file(s) received for job ${jobId}`);

  // Ensure the storage bucket exists
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.some(b => b.name === 'resumes')) {
      logger.warn('[Upload] Creating missing "resumes" bucket…');
      const { error: createErr } = await supabase.storage.createBucket('resumes', {
        public: false,
        fileSizeLimit: 20971520,
        allowedMimeTypes: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'],
      });
      if (createErr) {
        return res.status(500).json({ error: `Cannot create storage bucket: ${createErr.message}` });
      }
    }
  } catch (err) {
    logger.warn(`[Upload] Bucket check skipped: ${err.message}`);
  }

  // Process ALL files concurrently, each with a 30s timeout
  const settled = await Promise.allSettled(
    req.files.map((file) =>
      withTimeout(
        (async () => {
          const fileId = uuidv4();
          const ext = file.originalname.split('.').pop().toLowerCase();
          const storagePath = `${recruiterId}/${jobId}/${fileId}.${ext}`;

          logger.info(`[Upload] "${file.originalname}" (${(file.size / 1024).toFixed(0)} KB)`);

          // 1. Upload to Supabase Storage
          const { data: storageData, error: storageError } = await supabase.storage
            .from('resumes')
            .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: true });

          if (storageError) {
            throw new Error(`Storage upload failed: ${storageError.message}`);
          }
          logger.info(`[Upload] Storage OK: "${file.originalname}" → ${storageData?.path}`);

          // 2. Insert candidate record
          const { data: candidate, error: candidateError } = await supabase
            .from('candidates')
            .insert({
              job_id: jobId,
              recruiter_id: recruiterId,
              resume_file_path: storagePath,
              resume_file_name: file.originalname,
              processing_status: 'pending',
            })
            .select()
            .single();

          if (candidateError) {
            await supabase.storage.from('resumes').remove([storagePath]).catch(() => {});
            throw new Error(`DB insert failed: ${candidateError.message}`);
          }
          logger.info(`[Upload] DB OK: "${file.originalname}" → candidate ${candidate.id}`);

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
        30000 // 30 second timeout per file
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
  errors.forEach(e => logger.error(`[Upload] ✗ "${e.fileName}": ${e.error}`));

  if (results.length === 0) {
    return res.status(500).json({ error: errors[0]?.error || 'All uploads failed', errors });
  }

  res.status(202).json({
    message: `${results.length} of ${req.files.length} resume(s) queued`,
    queued: results,
    errors,
  });
});

// GET /api/jobs/:id/candidates
router.get('/jobs/:id/candidates', authMiddleware, async (req, res) => {
  const { id: jobId } = req.params;
  const { status, page = 1, limit = 50 } = req.query;

  const { data: job } = await supabase
    .from('jobs').select('id')
    .eq('id', jobId).eq('recruiter_id', req.user.id).single();
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const { data, error } = await supabase
    .from('candidates')
    .select('*, resume_scores(score, status, matched_skills, missing_skills, summary, strengths, weaknesses, experience_match, education_match)')
    .eq('job_id', jobId)
    .eq('recruiter_id', req.user.id)
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (error) return res.status(500).json({ error: 'Failed to fetch candidates' });

  const candidates = data.map(c => ({
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
    resume_scores: undefined,
  }));

  const filtered = status ? candidates.filter(c => c.score_status === status) : candidates;
  res.json({ candidates: filtered, total: filtered.length });
});

// GET /api/candidates/:id
router.get('/candidates/:id', authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('candidates')
    .select('*, jobs(id, job_title, company_name), resume_scores(*)')
    .eq('id', req.params.id)
    .eq('recruiter_id', req.user.id)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Candidate not found' });

  const { data: signedUrl } = await supabase.storage
    .from('resumes').createSignedUrl(data.resume_file_path, 3600);

  res.json({
    candidate: {
      ...data,
      job: data.jobs,
      score_data: data.resume_scores?.[0] ?? null,
      resume_download_url: signedUrl?.signedUrl ?? null,
      jobs: undefined,
      resume_scores: undefined,
    },
  });
});

module.exports = router;
