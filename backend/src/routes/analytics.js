const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');

// GET /api/jobs/:id/analytics - Get analytics for a job
router.get('/jobs/:id/analytics', authMiddleware, async (req, res) => {
  const { id: jobId } = req.params;

  // Verify job ownership
  const { data: job } = await supabase
    .from('jobs')
    .select('id, job_title, company_name')
    .eq('id', jobId)
    .eq('recruiter_id', req.user.id)
    .single();

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  // Get all scores for this job
  const { data: scores, error } = await supabase
    .from('resume_scores')
    .select('score, status, matched_skills, missing_skills, strengths, weaknesses, experience_match, education_match')
    .eq('job_id', jobId);

  if (error) {
    return res.status(500).json({ error: 'Failed to fetch analytics' });
  }

  if (!scores || scores.length === 0) {
    return res.json({
      job,
      total_candidates: 0,
      pass_count: 0,
      review_count: 0,
      fail_count: 0,
      average_score: 0,
      score_distribution: [],
      top_matched_skills: [],
      top_missing_skills: [],
      top_strengths: [],
    });
  }

  // Score distribution (bucketed into ranges)
  const distribution = [
    { range: '0-10', count: 0 },
    { range: '10-20', count: 0 },
    { range: '20-30', count: 0 },
    { range: '30-40', count: 0 },
    { range: '40-50', count: 0 },
    { range: '50-60', count: 0 },
    { range: '60-70', count: 0 },
    { range: '70-80', count: 0 },
    { range: '80-90', count: 0 },
    { range: '90-100', count: 0 },
  ];

  let totalScore = 0;
  let passCount = 0, reviewCount = 0, failCount = 0;

  // Skill frequency maps
  const matchedSkillMap = {};
  const missingSkillMap = {};
  const strengthMap = {};

  scores.forEach(s => {
    totalScore += parseFloat(s.score);

    // Status counts
    if (s.status === 'pass') passCount++;
    else if (s.status === 'review') reviewCount++;
    else failCount++;

    // Distribution bucket
    const bucket = Math.min(Math.floor(parseFloat(s.score) / 10), 9);
    distribution[bucket].count++;

    // Skill aggregation
    (s.matched_skills || []).forEach(skill => {
      matchedSkillMap[skill] = (matchedSkillMap[skill] || 0) + 1;
    });
    (s.missing_skills || []).forEach(skill => {
      missingSkillMap[skill] = (missingSkillMap[skill] || 0) + 1;
    });
    (s.strengths || []).forEach(strength => {
      strengthMap[strength] = (strengthMap[strength] || 0) + 1;
    });
  });

  const sortByCount = (map) =>
    Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([skill, count]) => ({ skill, count }));

  res.json({
    job,
    total_candidates: scores.length,
    pass_count: passCount,
    review_count: reviewCount,
    fail_count: failCount,
    average_score: parseFloat((totalScore / scores.length).toFixed(1)),
    score_distribution: distribution,
    top_matched_skills: sortByCount(matchedSkillMap),
    top_missing_skills: sortByCount(missingSkillMap),
    top_strengths: sortByCount(strengthMap),
  });
});

module.exports = router;
