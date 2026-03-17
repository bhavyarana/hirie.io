const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');
const logger = require('../config/logger');

/**
 * GET /api/talent-pool/uploaders
 * Returns distinct users who have uploaded to the talent pool.
 * Accessible to ALL roles (no role restriction).
 * Used to populate the "Uploaded By" filter dropdown.
 */
router.get('/uploaders', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('talent_pool')
      .select('uploaded_by')
      .not('uploaded_by', 'is', null);

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch uploaders' });
    }

    const uploaderIds = [...new Set((data || []).map(r => r.uploaded_by))];
    if (uploaderIds.length === 0) return res.json({ uploaders: [] });

    const { data: users } = await supabase
      .from('users')
      .select('id, name, email')
      .in('id', uploaderIds)
      .order('name', { ascending: true });

    const uploaders = (users || []).map(u => ({
      id: u.id,
      name: u.name || u.email,
    }));

    res.json({ uploaders });
  } catch (err) {
    logger.error('Uploaders fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch uploaders' });
  }
});

/**
 * POST /api/talent-pool/backfill
 * Admin/Manager only: Copies all existing candidates into talent_pool (idempotent).
 */
router.post('/backfill', authMiddleware, async (req, res) => {
  const { role } = req.user;
  if (role !== 'admin' && role !== 'manager') {
    return res.status(403).json({ error: 'Only admin or manager can run backfill' });
  }

  try {
    const { data: allCandidates, error: fetchError } = await supabase
      .from('candidates')
      .select(`
        id, email, name, phone,
        resume_file_path, resume_file_name, resume_hash,
        extracted_skills, extracted_titles,
        experience_years, current_location,
        recruiter_id, job_id, created_at,
        job:jobs!candidates_job_id_fkey(id, job_title)
      `)
      .order('created_at', { ascending: true });

    if (fetchError) {
      return res.status(500).json({ error: 'Failed to fetch candidates', detail: fetchError.message });
    }

    const seenEmails = new Set();
    const seenHashes = new Set();
    const toInsert = [];

    for (const c of allCandidates || []) {
      if (c.email && seenEmails.has(c.email)) continue;
      if (c.resume_hash && seenHashes.has(c.resume_hash)) continue;
      if (c.email) seenEmails.add(c.email);
      if (c.resume_hash) seenHashes.add(c.resume_hash);

      toInsert.push({
        candidate_id: c.id,
        email: c.email || null,
        name: c.name || null,
        phone: c.phone || null,
        resume_file_path: c.resume_file_path,
        resume_file_name: c.resume_file_name,
        resume_hash: c.resume_hash || null,
        extracted_skills: c.extracted_skills || [],
        extracted_titles: c.extracted_titles || [],
        experience_years: c.experience_years || null,
        current_location: c.current_location || null,
        uploaded_by: c.recruiter_id || null,
        first_seen_job_id: c.job_id || null,
        first_seen_job_title: c.job?.job_title || null,
        created_at: c.created_at,
      });
    }

    if (toInsert.length === 0) {
      return res.json({ message: 'No candidates to backfill', inserted: 0 });
    }

    let inserted = 0;
    const BATCH = 100;
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const batch = toInsert.slice(i, i + BATCH);
      const { error: insertError } = await supabase
        .from('talent_pool')
        .upsert(batch, { onConflict: 'resume_hash', ignoreDuplicates: true });
      if (insertError) {
        logger.warn(`[Backfill] Batch error: ${insertError.message}`);
      } else {
        inserted += batch.length;
      }
    }

    logger.info(`[Backfill] Done: ${inserted}/${allCandidates.length} processed`);
    res.json({ message: 'Backfill completed', processed: allCandidates.length, inserted });
  } catch (err) {
    logger.error('[Backfill] Unexpected error:', err);
    res.status(500).json({ error: 'Backfill failed', detail: err.message });
  }
});

/**
 * GET /api/talent-pool
 * All authenticated roles. Full filter support.
 */
router.get('/', authMiddleware, async (req, res) => {
  const {
    q, location, uploaded_by, date_range, year, month,
    min_exp, max_exp, page = 1, limit = 24,
  } = req.query;

  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    let query = supabase
      .from('talent_pool')
      .select(
        `id, candidate_id, name, email, phone,
         resume_file_path, resume_file_name,
         extracted_skills, extracted_titles,
         experience_years, current_location,
         first_seen_job_title, uploaded_by,
         created_at, updated_at`,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (q && q.trim()) {
      const kw = q.trim();
      query = query.or(
        `name.ilike.%${kw}%,extracted_skills.cs.{${kw}},extracted_titles.cs.{${kw}}`
      );
    }

    if (location && location.trim()) {
      query = query.ilike('current_location', `%${location.trim()}%`);
    }

    if (uploaded_by && uploaded_by.trim()) {
      query = query.eq('uploaded_by', uploaded_by.trim());
    }

    if (date_range) {
      const now = new Date();
      let since = null;

      if (date_range === 'last_24h') {
        since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      } else if (date_range === 'last_week') {
        since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (date_range === 'last_month') {
        since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      } else if (date_range === 'custom' && year) {
        const y = parseInt(year);
        const m = month ? parseInt(month) : null;
        if (m) {
          query = query
            .gte('created_at', new Date(y, m - 1, 1).toISOString())
            .lt('created_at', new Date(y, m, 1).toISOString());
        } else {
          query = query
            .gte('created_at', new Date(y, 0, 1).toISOString())
            .lt('created_at', new Date(y + 1, 0, 1).toISOString());
        }
      }

      if (since) query = query.gte('created_at', since.toISOString());
    }

    if (min_exp) query = query.gte('experience_years', parseFloat(min_exp));
    if (max_exp) query = query.lte('experience_years', parseFloat(max_exp));

    const { data, error, count } = await query;

    if (error) {
      logger.error('Talent pool fetch error:', error);
      return res.status(500).json({ error: 'Failed to fetch talent pool', detail: error.message });
    }

    // Resolve uploader names from public.users (auth.users can't be joined via PostgREST)
    const uploaderIds = [...new Set((data || []).map(c => c.uploaded_by).filter(Boolean))];
    const uploaderMap = {};
    if (uploaderIds.length > 0) {
      const { data: uploaders } = await supabase
        .from('users')
        .select('id, name, email')
        .in('id', uploaderIds);
      (uploaders || []).forEach(u => {
        uploaderMap[u.id] = u.name || u.email || null;
      });
    }

    const candidates = (data || []).map(c => ({
      id: c.id,
      candidate_id: c.candidate_id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      resume_file_path: c.resume_file_path,
      resume_file_name: c.resume_file_name,
      extracted_skills: c.extracted_skills || [],
      extracted_titles: c.extracted_titles || [],
      experience_years: c.experience_years,
      current_location: c.current_location,
      first_seen_job_title: c.first_seen_job_title,
      uploaded_by: c.uploaded_by,
      uploaded_by_name: uploaderMap[c.uploaded_by] || null,
      created_at: c.created_at,
      updated_at: c.updated_at,
    }));

    res.json({ candidates, total: count || 0, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    logger.error('Talent pool unexpected error:', err);
    res.status(500).json({ error: 'Unexpected error fetching talent pool' });
  }
});

/**
 * GET /api/talent-pool/:id
 * Single talent pool entry. Accessible to ALL roles.
 */
router.get('/:id', authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('talent_pool')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: 'Talent pool entry not found' });
  }

  let uploaderName = null;
  if (data.uploaded_by) {
    const { data: u } = await supabase
      .from('users').select('name, email').eq('id', data.uploaded_by).single();
    uploaderName = u?.name || u?.email || null;
  }

  let resumeUrl = null;
  if (data.resume_file_path) {
    const { data: signed } = await supabase.storage
      .from('resumes').createSignedUrl(data.resume_file_path, 3600);
    resumeUrl = signed?.signedUrl || null;
  }

  res.json({
    candidate: { ...data, uploaded_by_name: uploaderName, resume_download_url: resumeUrl },
  });
});

module.exports = router;
