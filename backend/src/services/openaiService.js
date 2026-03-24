const mistral = require('../config/openai');
const logger  = require('../config/logger');

// ─── Default scoring criteria ──────────────────────────────────────────────────

const DEFAULT_CRITERIA = {
  pass_threshold  : 70,
  review_threshold: 50,
  weights: {
    technical_skills: 35,
    experience      : 30,
    education       : 20,
    soft_skills     : 15,
  },
};

function getStatus(score, criteria = DEFAULT_CRITERIA) {
  const pass   = criteria.pass_threshold   ?? 70;
  const review = criteria.review_threshold ?? 50;
  if (score >= pass)   return 'pass';
  if (score >= review) return 'review';
  return 'fail';
}

// ─── Phone normalisation helper ────────────────────────────────────────────────

function normalisePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  let local = digits;
  if (local.startsWith('0091') && local.length >= 14) local = local.slice(4);
  else if (local.startsWith('91') && local.length === 12) local = local.slice(2);
  else if (local.startsWith('0')  && local.length === 11) local = local.slice(1);
  return /^[6-9]\d{9}$/.test(local) ? local : null;
}

// ─── Unified Parse + Score (ONE API call) ────────────────────────────────────

/**
 * Production-grade, single-call resume processing.
 *
 * Extracts:  name, email, phone, skills, job titles, experience years, location
 * Scores:    ATS score, dimension scores, strengths, weaknesses, matched/missing skills, summary
 *
 * All in ONE Mistral API call — maximises accuracy, minimises cost.
 *
 * @param {string} resumeText       - Full normalised resume text
 * @param {string} jobDescription   - Job description text
 * @param {string} jobTitle         - Job title string
 * @param {object|null} scoringCriteria - Optional custom scoring weights/thresholds
 * @param {object} hints            - Regex-derived seeds: { email, phone }
 * @returns {{ basicInfo, profile, scoreResult }}
 */
async function parseAndScoreResume(resumeText, jobDescription, jobTitle, scoringCriteria = null, hints = {}) {
  const criteria       = scoringCriteria  || DEFAULT_CRITERIA;
  const weights        = criteria.weights || DEFAULT_CRITERIA.weights;
  const wTech          = weights.technical_skills ?? 35;
  const wExp           = weights.experience       ?? 30;
  const wEdu           = weights.education        ?? 20;
  const wSoft          = weights.soft_skills      ?? 15;
  const passThreshold  = criteria.pass_threshold   ?? DEFAULT_CRITERIA.pass_threshold;
  const reviewThreshold= criteria.review_threshold ?? DEFAULT_CRITERIA.review_threshold;

  // Regex hints improve extraction accuracy without an extra API call
  const hintLines = [
    hints.email ? `Detected email (from document scan): ${hints.email}` : '',
    hints.phone ? `Detected phone (from document scan): ${hints.phone}` : '',
  ].filter(Boolean).join('\n');

  const prompt = `You are a senior ATS engine, expert technical recruiter, and resume parser with 15+ years of experience. In ONE pass, extract candidate contact details and profile from the resume, then score it against the job description. Return ONLY a valid JSON object — no markdown, no code fences, no extra text.

${hintLines ? `━━━ DOCUMENT HINTS (use to confirm contact details) ━━━\n${hintLines}\n` : ''}
━━━ JOB INFORMATION ━━━
Job Title: ${jobTitle}

Job Description:
${jobDescription.slice(0, 3000)}

━━━ CANDIDATE RESUME ━━━
${resumeText.slice(0, 5000)}

━━━ CONTACT EXTRACTION RULES ━━━
- name: The candidate's full personal name ONLY (e.g. "Rahul Kumar Sharma"). Title-case it.
  DO NOT include job titles, company names, or any label text. Look at the very top of the resume.
  If the resume is ALL-CAPS, convert to Title Case.
- email: Return the email address exactly as written, or null.
- phone: Strip country code (+91 / 91 / 0091). Return 10 digits only (must start with 6-9). Return null if not found.

━━━ SCORING RUBRIC ━━━
Score four dimensions 0-100:
1. TECHNICAL SKILLS    (weight: ${wTech}%)
2. EXPERIENCE          (weight: ${wExp}%)
3. EDUCATION           (weight: ${wEdu}%)
4. SOFT SKILLS         (weight: ${wSoft}%)

final_score = (technical×${wTech/100}) + (experience×${wExp/100}) + (education×${wEdu/100}) + (soft_skills×${wSoft/100})
- PASS:   score ≥ ${passThreshold}
- REVIEW: score ≥ ${reviewThreshold} and < ${passThreshold}
- FAIL:   score < ${reviewThreshold}

━━━ ACCURACY RULES ━━━
- Scores must reflect genuine gaps. Do NOT default to 85 for everyone.
- Strengths and weaknesses must be SPECIFIC to this candidate.
- Summary must mention the candidate's name, key technologies, and primary gap.

━━━ REQUIRED JSON OUTPUT ━━━
{
  "name": "<full name, Title Case, personal name only>",
  "email": "<email or null>",
  "phone": "<10-digit number string or null>",
  "skills": [<up to 30 technical and professional skills>],
  "titles": [<up to 10 job titles held or inferred>],
  "experience_years": <total years as number or null>,
  "location": "<city/region or null>",
  "score": <final weighted score 0-100, decimals allowed>,
  "dimension_scores": {
    "technical_skills": <0-100>,
    "experience": <0-100>,
    "education": <0-100>,
    "soft_skills": <0-100>
  },
  "strengths": [<3-5 specific evidence-based strengths>],
  "weaknesses": [<2-4 specific gaps vs JD>],
  "matched_skills": [<skills from JD the candidate has>],
  "missing_skills": [<required JD skills the candidate lacks>],
  "experience_match": <same value as dimension_scores.experience>,
  "education_match": <same value as dimension_scores.education>,
  "summary": "<3-4 sentence professional assessment: name, key experience, alignment, primary gap>"
}`;

  const MAX_RETRIES = 3;
  let lastErr = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await mistral.chat.complete({
        model: process.env.MISTRAL_MODEL || 'mistral-small-latest',
        messages: [
          {
            role   : 'system',
            content: 'You are a precision ATS engine and resume parser. Return ONLY valid JSON — no markdown, no code blocks, no explanations.',
          },
          { role: 'user', content: prompt },
        ],
        temperature   : 0,
        responseFormat: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('Empty response from Mistral');

      const parsed = JSON.parse(content);

      // ── Normalise phone ──
      let phone = null;
      if (parsed.phone && String(parsed.phone) !== 'null') {
        phone = normalisePhone(String(parsed.phone));
      }
      // Fall back to regex hint if AI couldn't find it
      if (!phone && hints.phone) phone = hints.phone;

      // ── Normalise email ──
      let email = null;
      if (parsed.email && String(parsed.email) !== 'null' && parsed.email.includes('@')) {
        email = String(parsed.email).trim().toLowerCase();
      }
      if (!email && hints.email) email = hints.email;

      // ── Normalise name ──
      let name = null;
      if (parsed.name && String(parsed.name) !== 'null') {
        name = String(parsed.name).trim();
        // Reject obvious garbage (too long, contains digits, all lowercase single word)
        if (name.length > 60 || /\d/.test(name) || (!name.includes(' ') && name === name.toLowerCase())) {
          name = null;
        }
      }

      const score = Math.max(0, Math.min(100, parseFloat(parsed.score) || 0));

      logger.info(`[AI] parseAndScore attempt ${attempt} OK → name:"${name}" email:${email} phone:${phone} score:${score}`);

      return {
        basicInfo: { name, email, phone },
        profile: {
          skills          : Array.isArray(parsed.skills) ? parsed.skills.slice(0, 30).map(s => String(s).trim()).filter(Boolean) : [],
          titles          : Array.isArray(parsed.titles) ? parsed.titles.slice(0, 10).map(t => String(t).trim()).filter(Boolean) : [],
          experience_years: parsed.experience_years != null ? (parseFloat(parsed.experience_years) || null) : null,
          location        : (parsed.location && String(parsed.location) !== 'null') ? String(parsed.location).trim() : null,
        },
        scoreResult: {
          score,
          status          : getStatus(score, criteria),
          strengths       : Array.isArray(parsed.strengths)      ? parsed.strengths.slice(0, 6)      : [],
          weaknesses      : Array.isArray(parsed.weaknesses)     ? parsed.weaknesses.slice(0, 5)     : [],
          matched_skills  : Array.isArray(parsed.matched_skills) ? parsed.matched_skills.slice(0, 25): [],
          missing_skills  : Array.isArray(parsed.missing_skills) ? parsed.missing_skills.slice(0, 20): [],
          experience_match: Math.max(0, Math.min(100, parseFloat(parsed.experience_match || parsed.dimension_scores?.experience) || 0)),
          education_match : Math.max(0, Math.min(100, parseFloat(parsed.education_match  || parsed.dimension_scores?.education)  || 0)),
          dimension_scores: parsed.dimension_scores || null,
          summary         : parsed.summary || 'Unable to generate summary.',
        },
      };
    } catch (err) {
      lastErr = err;

      const isQuota = err.status === 429 || err.statusCode === 429 ||
        (err.message && (err.message.includes('429') || err.message.includes('quota') || err.message.includes('rate limit')));

      if (isQuota) {
        logger.warn(`[AI] Quota/rate-limit hit — not retrying`);
        break;
      }

      if (attempt < MAX_RETRIES) {
        const delay = attempt * 1200; // 1.2 s, 2.4 s
        logger.warn(`[AI] parseAndScore attempt ${attempt}/${MAX_RETRIES} failed (${err.message?.slice(0, 80)}) — retry in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  // All retries exhausted — propagate
  const isQuotaError = lastErr?.status === 429 ||
    (lastErr?.message && (lastErr.message.includes('429') || lastErr.message.includes('quota') || lastErr.message.includes('rate limit')));
  const error = new Error(lastErr?.message || 'parseAndScoreResume failed after retries');
  error.isQuotaError = isQuotaError;
  throw error;
}

// ─── Placeholder score when AI is unavailable ─────────────────────────────────

function getPlaceholderScore() {
  return {
    score           : 0,
    status          : 'review',
    strengths       : [],
    weaknesses      : [],
    matched_skills  : [],
    missing_skills  : [],
    experience_match: 0,
    education_match : 0,
    dimension_scores: null,
    summary         : 'AI scoring unavailable — Mistral API key not set or quota exceeded. Add your MISTRAL_API_KEY to backend/.env.',
  };
}

module.exports = { parseAndScoreResume, getStatus, getPlaceholderScore };
