/**
 * resumeValidator.js
 * Two-stage resume validation:
 *   1. Fast heuristic check (no AI, no network)
 *   2. AI classification via Mistral (only called if heuristic passes)
 */

const mistral = require('../config/openai');
const logger = require('../config/logger');

// Keywords that commonly appear in resumes/CVs
const RESUME_KEYWORDS = [
  'experience', 'education', 'skills', 'projects',
  'work', 'summary', 'profile',
];

// Minimum matches required out of RESUME_KEYWORDS
const MIN_KEYWORD_MATCHES = 3;

// Minimum text length (chars) to be considered a real document
const MIN_TEXT_LENGTH = 200;

// Regex patterns for contact info (at least one must be present)
const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;
const PHONE_REGEX = /(\+?\d[\s\-.]?){7,15}/;

/**
 * Stage 1 — Heuristic validation.
 * Fast, synchronous, zero network calls.
 *
 * @param {string} text — raw extracted text from the resume file
 * @returns {{ valid: boolean, reason?: string }}
 */
function isLikelyResume(text) {
  if (!text || typeof text !== 'string') {
    return { valid: false, reason: 'No text could be extracted from the file' };
  }

  const normalized = text.toLowerCase();

  // 1. Minimum length
  if (text.length < MIN_TEXT_LENGTH) {
    return {
      valid: false,
      reason: `Document too short (${text.length} chars). Minimum required: ${MIN_TEXT_LENGTH}`,
    };
  }

  // 2. Keyword count
  const matchedKeywords = RESUME_KEYWORDS.filter(kw => normalized.includes(kw));
  if (matchedKeywords.length < MIN_KEYWORD_MATCHES) {
    return {
      valid: false,
      reason: `Only ${matchedKeywords.length}/${MIN_KEYWORD_MATCHES} required resume keywords found (${matchedKeywords.join(', ') || 'none'})`,
    };
  }

  // 3. Contact info (email OR phone)
  const hasEmail = EMAIL_REGEX.test(text);
  const hasPhone = PHONE_REGEX.test(text);
  if (!hasEmail && !hasPhone) {
    return {
      valid: false,
      reason: 'No email address or phone number found in document',
    };
  }

  return { valid: true };
}

/**
 * Stage 2 — AI classification via Mistral.
 * Only called when the heuristic check passes.
 * Returns "VALID" or "INVALID".
 *
 * @param {string} text — raw extracted resume text
 * @returns {Promise<{ valid: boolean, reason?: string }>}
 */
async function classifyResumeWithAI(text) {
  const excerpt = text.slice(0, 3000);

  const prompt = `You are a strict document classifier.

Determine if the following text is a professional resume/CV.

Return ONLY one word:
VALID or INVALID

Rules:
- A VALID document must include candidate details like skills, experience, or education
- Mark INVALID for: invoices, books, job descriptions, random text, contracts, or any irrelevant document
- When in doubt, prefer VALID if the document looks like a personal professional profile

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
          content: 'You are a strict document classifier. Respond with ONLY the word VALID or INVALID — no punctuation, no explanation.',
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

    // Treat any non-INVALID response as VALID (defensive: covers "VALID", partial text, etc.)
    return { valid: true };
  } catch (err) {
    // If AI is unavailable (quota, network), fail open: let the document through
    // Heuristic already passed so the document is likely legitimate
    logger.warn(`[ResumeValidator] AI classification unavailable (${err.message.slice(0, 100)}) — treating as VALID`);
    return { valid: true };
  }
}

module.exports = { isLikelyResume, classifyResumeWithAI };
