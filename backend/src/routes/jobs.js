const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');
const logger = require('../config/logger');

// All job routes require authentication
router.use(authMiddleware);

// POST /api/jobs - Create a new job
router.post('/', async (req, res) => {
  const { job_title, company_name, job_description_text, required_skills } = req.body;

  if (!job_title || !company_name || !job_description_text) {
    return res.status(400).json({ error: 'job_title, company_name, and job_description_text are required' });
  }

  const { data, error } = await supabase
    .from('jobs')
    .insert({
      recruiter_id: req.user.id,
      job_title,
      company_name,
      job_description_text,
      required_skills: required_skills || [],
    })
    .select()
    .single();

  if (error) {
    logger.error('Error creating job:', error);
    // Return real Supabase error — if you see "relation jobs does not exist",
    // run the SQL migration in supabase/migrations/00_initial_schema.sql first.
    return res.status(500).json({
      error: error.message || 'Failed to create job',
      hint: error.hint || null,
    });
  }

  logger.info(`Job created: ${data.id} by recruiter ${req.user.id}`);
  res.status(201).json({ job: data });
});

// GET /api/jobs - List all jobs for the authenticated recruiter
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('jobs')
    .select('*, candidates(count)')
    .eq('recruiter_id', req.user.id)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('Error fetching jobs:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch jobs' });
  }

  const jobs = data.map(job => ({
    ...job,
    candidate_count: job.candidates?.[0]?.count || 0,
    candidates: undefined,
  }));

  res.json({ jobs });
});

// GET /api/jobs/:id - Get single job
router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', req.params.id)
    .eq('recruiter_id', req.user.id)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json({ job: data });
});

// PATCH /api/jobs/:id - Update a job
router.patch('/:id', async (req, res) => {
  const allowedFields = ['job_title', 'company_name', 'job_description_text', 'required_skills', 'status'];
  const updates = {};
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });

  const { data, error } = await supabase
    .from('jobs')
    .update(updates)
    .eq('id', req.params.id)
    .eq('recruiter_id', req.user.id)
    .select()
    .single();

  if (error || !data) {
    return res.status(404).json({ error: 'Job not found or update failed' });
  }

  res.json({ job: data });
});

// DELETE /api/jobs/:id - Delete a job
router.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('jobs')
    .delete()
    .eq('id', req.params.id)
    .eq('recruiter_id', req.user.id);

  if (error) {
    return res.status(500).json({ error: 'Failed to delete job' });
  }

  res.json({ message: 'Job deleted successfully' });
});

module.exports = router;
