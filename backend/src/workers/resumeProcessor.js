require('dotenv').config();
const { Worker, MetricsTime } = require('bullmq');
const redisConnection = require('../config/redis');
const supabase = require('../config/supabase');
const { downloadFile } = require('../services/storageService');
const { extractResumeText } = require('../services/parserService');
const { scoreResume, getPlaceholderScore, extractCandidateProfile } = require('../services/openaiService');
const logger = require('../config/logger');

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
    } = job.data;

    logger.info(`[Worker] Processing: ${fileName} (candidate: ${candidateId})`);

    // Step 1: Mark as processing
    await supabase
      .from('candidates')
      .update({ processing_status: 'processing' })
      .eq('id', candidateId);

    // Step 2: Download from Supabase Storage
    logger.info(`[Worker] Downloading: ${storagePath}`);
    const fileBuffer = await downloadFile(storagePath);

    const ext = storagePath.split('.').pop().toLowerCase();
    const mimeType = ext === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    // Step 3: Extract text
    logger.info(`[Worker] Extracting text from: ${fileName}`);
    const { text, basicInfo } = await extractResumeText(fileBuffer, mimeType);

    if (!text || text.length < 50) {
      throw new Error(`Could not extract sufficient text from resume: ${fileName}`);
    }

    logger.info(`[Worker] Extracted ${text.length} chars — candidate: ${JSON.stringify(basicInfo)}`);

    // Step 4: Update candidate with extracted info + run talent profile extraction in parallel
    const [profileResult] = await Promise.all([
      // Extract talent profile for search indexing (fire-and-forget style, never throws)
      extractCandidateProfile(text).catch(() => ({ skills: [], titles: [], experience_years: null, location: null })),
      // Update basic candidate info
      supabase.from('candidates').update({
        name: basicInfo.name,
        email: basicInfo.email,
        phone: basicInfo.phone,
        raw_text: text,
      }).eq('id', candidateId),
    ]);

    // Persist extracted talent profile for search
    if (profileResult.skills.length > 0 || profileResult.titles.length > 0 || profileResult.experience_years != null) {
      await supabase.from('candidates').update({
        extracted_skills: profileResult.skills,
        extracted_titles: profileResult.titles,
        experience_years: profileResult.experience_years,
        current_location: profileResult.location,
      }).eq('id', candidateId);
      logger.info(`[Worker] Profile extracted: ${profileResult.skills.length} skills, ${profileResult.titles.length} titles, ${profileResult.experience_years}yr exp`);
    }

    // Step 5: Score with Mistral AI — gracefully degrade on ANY AI error
    let scoreResult;
    try {
      logger.info(`[Worker] Scoring "${fileName}" with Mistral…`);
      scoreResult = await scoreResume(text, jobDescription, jobTitle);
      logger.info(`[Worker] Score: ${scoreResult.score} (${scoreResult.status}) for "${fileName}"`);
    } catch (aiErr) {
      // ANY AI failure (missing key, quota exceeded, network, etc.) → use placeholder
      // This ensures candidates always reach 'completed' and are visible in the UI
      logger.warn(`[Worker] AI scoring unavailable for "${fileName}" (${aiErr.message.slice(0, 80)}) — using placeholder`);
      scoreResult = getPlaceholderScore();
    }


    // Step 6: Save score
    const { error: scoreError } = await supabase
      .from('resume_scores')
      .upsert({
        candidate_id: candidateId,
        job_id: jobId,
        score: scoreResult.score,
        status: scoreResult.status,
        strengths: scoreResult.strengths,
        weaknesses: scoreResult.weaknesses,
        matched_skills: scoreResult.matched_skills,
        missing_skills: scoreResult.missing_skills,
        experience_match: scoreResult.experience_match,
        education_match: scoreResult.education_match,
        summary: scoreResult.summary,
        raw_response: scoreResult.raw_response,
      }, { onConflict: 'candidate_id' });

    if (scoreError) {
      throw new Error(`Failed to save score: ${scoreError.message}`);
    }

    // Step 7: Mark completed
    await supabase
      .from('candidates')
      .update({ processing_status: 'completed' })
      .eq('id', candidateId);

    logger.info(`[Worker] ✓ Completed: ${fileName} → Score: ${scoreResult.score}`);
    return { candidateId, score: scoreResult.score, status: scoreResult.status };
  },
  {
    connection: redisConnection,
    concurrency: CONCURRENCY,
    metrics: { maxDataPoints: MetricsTime.ONE_WEEK },
  }
);

// Event handlers
worker.on('completed', (job, result) => {
  logger.info(`[Worker] Job ${job.id} completed:`, result);
});

worker.on('failed', async (job, error) => {
  logger.error(`[Worker] Job ${job?.id} failed: ${error.message}`);
  if (job?.data?.candidateId) {
    try {
      await supabase
        .from('candidates')
        .update({
          processing_status: 'failed',
          error_message: error.message,
        })
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

// Graceful shutdown
process.on('SIGTERM', async () => { await worker.close(); process.exit(0); });
process.on('SIGINT',  async () => { await worker.close(); process.exit(0); });

logger.info('[Worker] Resume processor initialized');
