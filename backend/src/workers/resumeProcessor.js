require('dotenv').config();
const { Worker, QueueEvents, MetricsTime } = require('bullmq');
const http = require('http');

const redisConnection  = require('../config/redis');
const supabase         = require('../config/supabase');
const { downloadFile } = require('../services/storageService');
const { extractResumeText } = require('../services/parserService');
const { parseAndScoreResume, getPlaceholderScore } = require('../services/openaiService');
const { getResumeScore, classifyResumeWithAI }     = require('../services/resumeValidator');
const logger = require('../config/logger');

// ── Configuration ──────────────────────────────────────────────────────────────
const CONCURRENCY    = parseInt(process.env.WORKER_CONCURRENCY   || '3');
const HEALTH_PORT    = parseInt(process.env.WORKER_HEALTH_PORT   || '3002');
// Max time (ms) a single job is allowed to hold its lock before BullMQ treats it as stalled.
// Must be longer than the slowest possible job (AI call + Vision OCR can take ~60 s).
const LOCK_DURATION  = parseInt(process.env.WORKER_LOCK_DURATION || String(5 * 60_000)); // 5 min

// ── Helper: reject a candidate without throwing (no BullMQ retries) ───────────
async function rejectCandidate(candidateId, fileName, reason) {
  logger.warn(`[Worker] ✗ Rejected "${fileName}" (${candidateId}): ${reason}`);
  await supabase
    .from('candidates')
    .update({ processing_status: 'rejected', error_message: reason })
    .eq('id', candidateId);
}

// ── BullMQ Worker ─────────────────────────────────────────────────────────────
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

    // ── Step 4: ONE AI call — parse + score everything ─────────────────────────
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

    // ── Stalled-job protection ───────────────────────────────────────────────
    // lockDuration: each job must renew its lock within this window.
    // If a process dies mid-job, BullMQ re-queues it automatically after lockDuration ms.
    lockDuration: LOCK_DURATION,
    // How often BullMQ scans for stalled jobs (default: 30 s is good for production).
    stalledInterval: 30_000,
    // A stalled job gets re-queued at most once; after that it is marked failed.
    maxStalledCount: 1,

    // ── Metrics for Redis Commander / monitoring dashboards ──────────────────
    metrics: { maxDataPoints: MetricsTime.ONE_WEEK },
  }
);

// ── QueueEvents — observability (runs on a separate dedicated Redis connection) ─
// Logs stalled + permanently-failed events for alerting / monitoring integration.
const queueEvents = new QueueEvents('resume-processing', {
  connection: redisConnection.duplicate(), // must use a separate connection
});

queueEvents.on('stalled', ({ jobId }) => {
  logger.warn(`[Worker] ⚠ Job ${jobId} stalled — BullMQ will re-queue it`);
});

queueEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error(`[Worker] ✗ Job ${jobId} permanently failed: ${failedReason}`);
});

// ── Worker event handlers ──────────────────────────────────────────────────────

worker.on('completed', (job, result) => {
  logger.info(`[Worker] ✓ Job ${job.id} completed:`, result);
});

worker.on('failed', async (job, error) => {
  logger.error(`[Worker] ✗ Job ${job?.id} failed: ${error.message}`);
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
  logger.info(`[Worker] Resume processor ready (concurrency: ${CONCURRENCY}, lockDuration: ${LOCK_DURATION}ms)`);
});

// ── HTTP health probe ──────────────────────────────────────────────────────────
// Allows container orchestrators (Railway, k8s, Render) to probe the worker's health.
// GET /health → 200 { status: 'ok' } when running, 503 when draining/closing.
const healthServer = http.createServer((req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    const isRunning = !worker.closing;
    res.writeHead(isRunning ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status     : isRunning ? 'ok' : 'closing',
      concurrency: CONCURRENCY,
      timestamp  : new Date().toISOString(),
    }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

healthServer.listen(HEALTH_PORT, () => {
  logger.info(`[Worker] Health probe → http://localhost:${HEALTH_PORT}/health`);
});

// ── Graceful shutdown ──────────────────────────────────────────────────────────
// On SIGTERM / SIGINT:
//   1. Stop accepting new jobs (worker.close() drains in-flight jobs)
//   2. Close QueueEvents listener
//   3. Close the health probe server
//   4. Hard-exit after SHUTDOWN_TIMEOUT if jobs don't finish in time
const SHUTDOWN_TIMEOUT = parseInt(process.env.WORKER_SHUTDOWN_TIMEOUT || String(90_000));

async function shutdown(signal) {
  logger.info(`[Worker] ${signal} received — graceful shutdown initiated`);

  // Hard-timeout safety net: force exit if jobs don't finish in time
  const forceExitTimer = setTimeout(() => {
    logger.warn(`[Worker] Shutdown timeout (${SHUTDOWN_TIMEOUT}ms) reached — forcing exit`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT);
  forceExitTimer.unref(); // don't let this timer keep the process alive if shutdown is clean

  try {
    // Drain in-flight jobs gracefully, stop picking up new ones
    await worker.close();
    await queueEvents.close();
    healthServer.close();
    clearTimeout(forceExitTimer);
    logger.info('[Worker] Graceful shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error('[Worker] Error during shutdown:', err.message);
    clearTimeout(forceExitTimer);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

logger.info(`[Worker] Resume processor initializing (concurrency: ${CONCURRENCY}, health: :${HEALTH_PORT})`);
