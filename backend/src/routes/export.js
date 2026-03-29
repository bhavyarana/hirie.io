const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');

// GET /api/jobs/:id/export - Export candidates as CSV
router.get('/jobs/:id/export', authMiddleware, async (req, res) => {
  const { id: jobId } = req.params;

  // Verify job exists (any authenticated user can export)
  const { data: job } = await supabase
    .from('jobs')
    .select('id, job_title, company_name')
    .eq('id', jobId)
    .single();

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const { data: candidates, error } = await supabase
    .from('candidates')
    .select(`
      name, email, phone, resume_file_name, processing_status, hiring_status,
      hiring_feedback, rejection_reason, created_at,
      recruiter:users!candidates_recruiter_id_fkey(name, email),
      resume_scores(score, status, matched_skills, missing_skills, strengths, weaknesses, summary)
    `)
    .eq('job_id', jobId)
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: 'Failed to fetch candidates' });
  }

  // Build CSV
  const headers = [
    'Name',
    'Email',
    'Phone',
    'Resume File',
    'Score',
    'AI Status',
    'Hiring Status',
    'Hiring Feedback',
    'Rejection Reason',
    'Uploaded By',
    'Strengths',
    'Missing Skills',
    'Matched Skills',
    'Summary',
    'Processing Status',
    'Uploaded At',
  ];

  const escapeCSV = (value) => {
    if (value === null || value === undefined) return '';
    const str = Array.isArray(value) ? value.join('; ') : String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = candidates.map(c => {
    const score = c.resume_scores?.[0];
    const uploaderName = c.recruiter?.name || c.recruiter?.email || '';
    const hiringLabel = (c.hiring_status || '').replace(/_/g, ' ');
    return [
      escapeCSV(c.name),
      escapeCSV(c.email),
      escapeCSV(c.phone),
      escapeCSV(c.resume_file_name),
      escapeCSV(score?.score),
      escapeCSV(score?.status),
      escapeCSV(hiringLabel),
      escapeCSV(c.hiring_feedback),
      escapeCSV(c.rejection_reason),
      escapeCSV(uploaderName),
      escapeCSV(score?.strengths),
      escapeCSV(score?.missing_skills),
      escapeCSV(score?.matched_skills),
      escapeCSV(score?.summary),
      escapeCSV(c.processing_status),
      escapeCSV(new Date(c.created_at).toLocaleDateString()),
    ].join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\n');
  const filename = `${job.company_name}-${job.job_title}-candidates.csv`
    .replace(/[^a-z0-9\-_.]/gi, '_');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csvContent);
});


module.exports = router;
