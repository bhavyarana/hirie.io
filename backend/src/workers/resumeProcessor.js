require('dotenv').config();
const { Worker, MetricsTime } = require('bullmq');
const redisConnection  = require('../config/redis');
const supabase         = require('../config/supabase');
const { downloadFile } = require('../services/storageService');
const { extractResumeText } = require('../services/parserService');
const { parseAndScoreResume, getPlaceholderScore } = require('../services/openaiService');
const { getResumeScore, classifyResumeWithAI }     = require('../services/resumeValidator');
const logger = require('../config/logger');

/**
 * Mark a candidate as rejected and log the reason.
 * BullMQ treats this as a successful job completion (no retries).
 */
async function rejectCandidate(candidateId, fileName, reason) {
  logger.warn(`[Worker] ✗ Rejected "${fileName}" (${candidateId}): ${reason}`);
  await supabase
    .from('candidates')
    .update({ processing_status: 'rejected', error_message: reason })
    .eq('id', candidateId);
}

const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '5');

const worker = new Worker(
  'resume-processing',
  async (job) => {
    const {
      candidateId,
      jobId,
      recruiterId,
      storagePath,
      fileName,
      jobDescription,
      jobTitle,
      scoringCriteria,
    } = job.data;

    logger.info(`[Worker] ▶ Processing: "${fileName}" (candidate: ${candidateId})`);

    // ── Step 1: Mark as processing ─────────────────────────────────────────────
    await supabase
      .from('candidates')
      .update({ processing_status: 'processing' })
      .eq('id', candidateId);

    // ── Step 2: Download from Supabase Storage ─────────────────────────────────
    logger.info(`[Worker] Downloading: ${storagePath}`);
    const fileBuffer = await downloadFile(storagePath);

    const ext      = storagePath.split('.').pop().toLowerCase();
    const mimeType = ext === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    // ── Step 3: Extract text (local, no AI cost) ───────────────────────────────
    logger.info(`[Worker] Extracting text from: "${fileName}"`);
    const { text, hints } = await extractResumeText(fileBuffer, mimeType);

    // ── Step 3a: Reject unreadable files ──────────────────────────────────────
    if (!text || text.length < 50) {
      await rejectCandidate(candidateId, fileName,
        'Could not extract readable text. The file may be a scanned image, corrupted, or empty.');
      return { candidateId, status: 'rejected', reason: 'unreadable' };
    }

    logger.info(`[Worker] Extracted ${text.length} chars from "${fileName}"`);

    // ── Step 3b: Heuristic validation (free, no API) ──────────────────────────
    const heuristicScore = getResumeScore(text);
    logger.info(`[Worker] Heuristic score: ${heuristicScore}/100 for "${fileName}"`);

    if (heuristicScore < 30) {
      await rejectCandidate(candidateId, fileName,
        'Invalid resume content: document does not resemble a resume or CV.');
      return { candidateId, status: 'rejected', reason: 'heuristic', score: heuristicScore };
    }

    if (heuristicScore < 60) {
      logger.info(`[Worker] Score ${heuristicScore} is borderline — AI classification for "${fileName}"`);
      const aiResult = await classifyResumeWithAI(text);
      if (!aiResult.valid) {
        await rejectCandidate(candidateId, fileName,
          'Uploaded file is not a valid resume. Please upload a professional CV or resume document.');
        return { candidateId, status: 'rejected', reason: 'ai_classifier', detail: aiResult.reason };
      }
      logger.info(`[Worker] AI classifier: VALID — proceeding with "${fileName}"`);
    } else {
      logger.info(`[Worker] High-confidence resume (${heuristicScore}) — skipping AI classifier for "${fileName}"`);
    }

    // ── Step 4: ONE AI call — parse + score everything ────────────────────────
    let basicInfo, profile, scoreResult;

    try {
      logger.info(`[Worker] Calling parseAndScoreResume for "${fileName}"…`);
      ({ basicInfo, profile, scoreResult } = await parseAndScoreResume(
        text,
        jobDescription,
        jobTitle,
        scoringCriteria || null,
        hints, // regex seeds: { email, phone }
      ));
      logger.info(`[Worker] AI result → name:"${basicInfo.name}" email:${basicInfo.email} phone:${basicInfo.phone} score:${scoreResult.score} (${scoreResult.status})`);
    } catch (aiErr) {
      // AI unavailable (quota / key missing / network) → degrade gracefully
      logger.warn(`[Worker] AI unavailable for "${fileName}" (${aiErr.message?.slice(0, 80)}) — using placeholder`);
      basicInfo   = { name: null, email: hints.email || null, phone: hints.phone || null };
      profile     = { skills: [], titles: [], experience_years: null, location: null };
      scoreResult = getPlaceholderScore();
    }

    // ── Step 5: Persist candidate contact info + profile ──────────────────────
    await supabase.from('candidates').update({
      name : basicInfo.name,
      email: basicInfo.email,
      phone: basicInfo.phone,
    }).eq('id', candidateId);

    if (profile.skills.length > 0 || profile.titles.length > 0 || profile.experience_years != null) {
      await supabase.from('candidates').update({
        extracted_skills: profile.skills,
        extracted_titles: profile.titles,
        experience_years: profile.experience_years,
        current_location: profile.location,
      }).eq('id', candidateId);
      logger.info(`[Worker] Profile → ${profile.skills.length} skills, ${profile.titles.length} titles, ${profile.experience_years}yr exp`);
    }

    // ── Step 5b: Sync to talent_pool ──────────────────────────────────────────
    try {
      const { data: candidateRow } = await supabase
        .from('candidates')
        .select('resume_hash')
        .eq('id', candidateId)
        .single();

      if (candidateRow?.resume_hash) {
        const { data: poolEntry } = await supabase
          .from('talent_pool')
          .select('id, email')
          .eq('resume_hash', candidateRow.resume_hash)
          .maybeSingle();

        if (poolEntry) {
          const newEmail = basicInfo.email || null;

          if (newEmail) {
            const { data: emailConflict } = await supabase
              .from('talent_pool')
              .select('id')
              .eq('email', newEmail)
              .neq('id', poolEntry.id)
              .maybeSingle();

            if (emailConflict) {
              await supabase.from('talent_pool').delete().eq('id', poolEntry.id);
              logger.info(`[TalentPool] Removed duplicate pool entry ${poolEntry.id} (email ${newEmail} already exists)`);
            } else {
              await supabase.from('talent_pool').update({
                email           : newEmail,
                name            : basicInfo.name  || null,
                phone           : basicInfo.phone || null,
                extracted_skills: profile.skills  || [],
                extracted_titles: profile.titles  || [],
                experience_years: profile.experience_years,
                current_location: profile.location,
              }).eq('id', poolEntry.id);
              logger.info(`[TalentPool] Updated pool entry ${poolEntry.id}`);
            }
          } else {
            // No email — still update profile fields
            await supabase.from('talent_pool').update({
              name            : basicInfo.name  || null,
              phone           : basicInfo.phone || null,
              extracted_skills: profile.skills  || [],
              extracted_titles: profile.titles  || [],
              experience_years: profile.experience_years,
              current_location: profile.location,
            }).eq('id', poolEntry.id);
            logger.info(`[TalentPool] Updated pool entry ${poolEntry.id} (no email)`);
          }
        }
      }
    } catch (poolErr) {
      logger.warn(`[TalentPool] Sync failed for candidate ${candidateId}: ${poolErr.message}`);
    }

    // ── Step 6: Save score ─────────────────────────────────────────────────────
    await supabase.from('resume_scores').delete().eq('candidate_id', candidateId);

    const { error: scoreError } = await supabase.from('resume_scores').insert({
      candidate_id    : candidateId,
      score           : scoreResult.score,
      status          : scoreResult.status,
      strengths       : scoreResult.strengths,
      weaknesses      : scoreResult.weaknesses,
      matched_skills  : scoreResult.matched_skills,
      missing_skills  : scoreResult.missing_skills,
      experience_match: scoreResult.experience_match,
      education_match : scoreResult.education_match,
      summary         : scoreResult.summary,
    });

    if (scoreError) throw new Error(`Failed to save score: ${scoreError.message}`);

    // ── Step 7: Mark completed ─────────────────────────────────────────────────
    await supabase
      .from('candidates')
      .update({ processing_status: 'completed' })
      .eq('id', candidateId);

    logger.info(`[Worker] ✓ Completed: "${fileName}" → Score: ${scoreResult.score} (${scoreResult.status}), Name: "${basicInfo.name}"`);
    return { candidateId, score: scoreResult.score, status: scoreResult.status };
  },
  {
    connection: redisConnection,
    concurrency: CONCURRENCY,
    metrics: { maxDataPoints: MetricsTime.ONE_WEEK },
  }
);

// ── Event handlers ────────────────────────────────────────────────────────────

worker.on('completed', (job, result) => {
  logger.info(`[Worker] Job ${job.id} completed:`, result);
});

worker.on('failed', async (job, error) => {
  logger.error(`[Worker] Job ${job?.id} failed: ${error.message}`);
  if (job?.data?.candidateId) {
    try {
      await supabase
        .from('candidates')
        .update({ processing_status: 'failed', error_message: error.message })
        .eq('id', job.data.candidateId);
    } catch (updateErr) {
      logger.error('[Worker] Failed to update candidate error status:', updateErr.message);
    }
  }
});

worker.on('error', (error) => {
  logger.error('[Worker] Worker error:', error.message);
});

worker.on('ready', () => {
  logger.info(`[Worker] Resume processor ready (concurrency: ${CONCURRENCY})`);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
process.on('SIGTERM', async () => { await worker.close(); process.exit(0); });
process.on('SIGINT',  async () => { await worker.close(); process.exit(0); });

logger.info('[Worker] Resume processor initialized');
