/**
 * resumeValidator.js
 * Confidence-score-based resume validation:
 *   Stage 1 — Heuristic confidence score (0–100, no network)
 *   Stage 2 — Lenient AI classification (only for uncertain scores 30–59)
 */

const mistral = require('../config/openai');
const logger = require('../config/logger');

// Keywords that appear in resumes (diverse set to catch creative formats too)
const RESUME_KEYWORDS = [
  'experience', 'education', 'skills', 'projects',
  'about', 'profile', 'work',
];

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;
const PHONE_REGEX = /(\+?\d[\s\-.]?){7,15}/;

/**
 * Stage 1 — Heuristic confidence score.
 * Purely synchronous, zero network calls.
 *
 * Scoring:
 *   +10 per matched keyword (max 70 from 7 keywords)
 *   +20 if an email address is found
 *   +10 if a phone number is found
 *   +20 if text length > 150 chars
 *
 * @param {string} text — raw extracted resume text
 * @returns {number} score 0–100
 */
function getResumeScore(text) {
  if (!text || typeof text !== 'string') return 0;

  const normalized = text.toLowerCase();
  let score = 0;

  // Keyword matches: +10 each
  for (const kw of RESUME_KEYWORDS) {
    if (normalized.includes(kw)) score += 10;
  }

  // Contact info
  if (EMAIL_REGEX.test(text)) score += 20;
  if (PHONE_REGEX.test(text)) score += 10;

  // Minimum length bonus
  if (text.length > 150) score += 20;

  return Math.min(score, 100);
}

/**
 * Stage 2 — Lenient AI classification via Mistral.
 * Only called for uncertain heuristic scores (30–59).
 * Returns VALID for creative/design/portfolio resumes.
 * Rejects only clearly non-resume documents.
 *
 * Fails OPEN (returns VALID) if Mistral is unavailable.
 *
 * @param {string} text — raw extracted resume text
 * @returns {Promise<{ valid: boolean, reason?: string }>}
 */
async function classifyResumeWithAI(text) {
  const excerpt = text.slice(0, 3000);

  const prompt = `You are a resume classifier.

Determine whether the given text is likely a resume or CV.

Return ONLY:
VALID or INVALID

IMPORTANT:
- Accept modern, creative, or design-based resumes
- Accept portfolios that include skills, experience, or projects
- Do NOT reject based on formatting or design

Reject ONLY if:
- It is clearly not a resume (invoice, book, legal contract, random content, article)

Be slightly lenient — when in doubt, return VALID.

Text:
"""
${excerpt}
"""`;

  try {
    const response = await mistral.chat.complete({
      model: process.env.MISTRAL_MODEL || 'mistral-small-latest',
      messages: [
        {
          role: 'system',
          content: 'You are a lenient resume classifier. Respond with ONLY the word VALID or INVALID — no punctuation, no explanation.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0,
      maxTokens: 5,
    });

    const answer = (response.choices[0]?.message?.content || '').trim().toUpperCase();
    logger.info(`[ResumeValidator] AI classification result: "${answer}"`);

    if (answer === 'INVALID') {
      return { valid: false, reason: 'AI classifier determined this is not a resume/CV' };
    }

    return { valid: true };
  } catch (err) {
    // Fail open — heuristic was borderline but document is not clearly invalid
    logger.warn(`[ResumeValidator] AI classification unavailable (${err.message.slice(0, 100)}) — treating as VALID`);
    return { valid: true };
  }
}

module.exports = { getResumeScore, classifyResumeWithAI };
