const mistral = require('../config/openai'); // re-uses the config export (now Mistral)
const logger = require('../config/logger');

function getStatus(score) {
  if (score >= 70) return 'pass';
  if (score >= 50) return 'review';
  return 'fail';
}

/**
 * Score a resume against a job description using Mistral AI.
 * Returns structured scoring data.
 * If Mistral is unavailable (quota, network etc.), throws an error
 * with `isQuotaError: true` so the worker can degrade gracefully.
 */
async function scoreResume(resumeText, jobDescription, jobTitle) {
  const prompt = `You are an expert technical recruiter. Analyze this resume against the job description and return ONLY a valid JSON object.

JOB TITLE: ${jobTitle}

JOB DESCRIPTION:
${jobDescription.slice(0, 3000)}

RESUME:
${resumeText.slice(0, 4000)}

Return ONLY this JSON — no extra text:
{
  "score": <number 0-100>,
  "strengths": [<3-5 strength strings>],
  "weaknesses": [<2-4 weakness strings>],
  "matched_skills": [<skills from JD that candidate has>],
  "missing_skills": [<required skills the candidate lacks>],
  "experience_match": <number 0-100>,
  "education_match": <number 0-100>,
  "summary": "<2-3 sentence professional summary>"
}

Scoring: 70-100 = strong match, 50-69 = partial match, 0-49 = weak match.`;

  try {
    const response = await mistral.chat.complete({
      model: process.env.MISTRAL_MODEL || 'mistral-small-latest',
      messages: [
        { role: 'system', content: 'You are a technical recruiter AI. Always respond with valid JSON only, no markdown.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      responseFormat: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response from Mistral');

    const parsed = JSON.parse(content);
    const score = Math.max(0, Math.min(100, parseFloat(parsed.score) || 0));

    return {
      score,
      status: getStatus(score),
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 6) : [],
      weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses.slice(0, 5) : [],
      matched_skills: Array.isArray(parsed.matched_skills) ? parsed.matched_skills.slice(0, 20) : [],
      missing_skills: Array.isArray(parsed.missing_skills) ? parsed.missing_skills.slice(0, 20) : [],
      experience_match: Math.max(0, Math.min(100, parseFloat(parsed.experience_match) || 0)),
      education_match: Math.max(0, Math.min(100, parseFloat(parsed.education_match) || 0)),
      summary: parsed.summary || 'Unable to generate summary.',
      raw_response: parsed,
    };
  } catch (err) {
    const isQuotaError = err.status === 429 || err.statusCode === 429
      || (err.message && (err.message.includes('429') || err.message.includes('quota') || err.message.includes('rate limit')));
    const error = new Error(err.message);
    error.isQuotaError = isQuotaError;
    throw error;
  }
}

/**
 * Placeholder score when Mistral is unavailable.
 * Resume text is still parsed — only AI scoring is skipped.
 */
function getPlaceholderScore() {
  return {
    score: 0,
    status: 'review',
    strengths: [],
    weaknesses: [],
    matched_skills: [],
    missing_skills: [],
    experience_match: 0,
    education_match: 0,
    summary: 'AI scoring unavailable — Mistral API key not set or quota exceeded. Add your MISTRAL_API_KEY to backend/.env.',
    raw_response: { placeholder: true },
  };
}

module.exports = { scoreResume, getStatus, getPlaceholderScore };
