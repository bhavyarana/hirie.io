const mistral = require('../config/openai');
const logger = require('../config/logger');

// Default scoring criteria if a job has none configured
const DEFAULT_CRITERIA = {
  pass_threshold: 70,
  review_threshold: 50,
  weights: {
    technical_skills: 35,
    experience: 30,
    education: 20,
    soft_skills: 15,
  },
};

function getStatus(score, criteria = DEFAULT_CRITERIA) {
  const pass = criteria.pass_threshold ?? 70;
  const review = criteria.review_threshold ?? 50;
  if (score >= pass) return 'pass';
  if (score >= review) return 'review';
  return 'fail';
}

/**
 * Production-grade ATS resume scoring using Mistral AI.
 * Evaluates resume against job description across 4 weighted dimensions.
 * Uses job-specific scoring_criteria if provided.
 */
async function scoreResume(resumeText, jobDescription, jobTitle, scoringCriteria = null) {
  const criteria = scoringCriteria || DEFAULT_CRITERIA;
  const weights = criteria.weights || DEFAULT_CRITERIA.weights;
  const passThreshold = criteria.pass_threshold ?? DEFAULT_CRITERIA.pass_threshold;
  const reviewThreshold = criteria.review_threshold ?? DEFAULT_CRITERIA.review_threshold;

  const wTech = weights.technical_skills ?? 35;
  const wExp = weights.experience ?? 30;
  const wEdu = weights.education ?? 20;
  const wSoft = weights.soft_skills ?? 15;

  const prompt = `You are a senior ATS (Applicant Tracking System) engine and expert technical recruiter with 15+ years of hiring experience across top tech companies. Your task is to objectively evaluate a candidate's resume against a specific job description and return a precise, structured JSON assessment.

━━━━━━━━━━━━━━━━━━━━━━━━━━
JOB INFORMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━
Job Title: ${jobTitle}

Job Description:
${jobDescription.slice(0, 3500)}

━━━━━━━━━━━━━━━━━━━━━━━━━━
CANDIDATE RESUME
━━━━━━━━━━━━━━━━━━━━━━━━━━
${resumeText.slice(0, 4500)}

━━━━━━━━━━━━━━━━━━━━━━━━━━
SCORING RUBRIC (follow STRICTLY)
━━━━━━━━━━━━━━━━━━━━━━━━━━

Evaluate the candidate on FOUR dimensions, each scored 0–100:

1. TECHNICAL & DOMAIN SKILLS (weight: ${wTech}%)
   - Does the candidate have the specific tools, frameworks, languages, or domain knowledge listed in the JD?
   - 90-100: Meets or exceeds ALL required technical skills plus nice-to-haves
   - 70-89: Meets most required skills (≥75%) with minor gaps in secondary areas
   - 50-69: Meets core skills but lacks multiple required technologies or domain knowledge
   - 30-49: Has some relevant skills but significant gaps in primary requirements
   - 0-29: Minimal alignment with technical requirements

2. PROFESSIONAL EXPERIENCE & SENIORITY (weight: ${wExp}%)
   - Years of relevant experience, seniority level alignment, role responsibilities, industry relevance
   - 90-100: Experience level is a perfect match or exceeds the role's requirements
   - 70-89: Solid experience aligned with 75%+ of required responsibilities
   - 50-69: Partially relevant experience; some role mismatch in scope or seniority
   - 30-49: Limited relevant experience; significant gaps in scope or years
   - 0-29: Little to no relevant professional experience

3. EDUCATION & CERTIFICATIONS (weight: ${wEdu}%)
   - Degree relevance, institution quality, certifications, training aligned to the role
   - 90-100: Degree in exact field required + relevant certifications
   - 70-89: Degree in related field OR strong compensating certifications
   - 50-69: Education is tangentially related or candidate is self-taught with evidence
   - 30-49: Unrelated degree, no certifications; relies purely on experience
   - 0-29: No formal education or certifications relevant to the role

4. COMMUNICATION & SOFT SKILLS (weight: ${wSoft}%)
   - Leadership, teamwork, communication, problem-solving based on described accomplishments
   - 90-100: Strong evidence of leadership, clear quantified achievements, excellent communication
   - 70-89: Good evidence of collaboration and ownership; at least some quantified results
   - 50-69: Generic soft skill mentions; limited evidence of leadership or measurable impact
   - 30-49: Vague role descriptions; minimal evidence of soft skills or initiative
   - 0-29: No evidence of soft skills or interpersonal contributions

━━━━━━━━━━━━━━━━━━━━━━━━━━
FINAL SCORE CALCULATION
━━━━━━━━━━━━━━━━━━━━━━━━━━
final_score = (technical_skills_score × ${wTech/100}) + (experience_score × ${wExp/100}) + (education_score × ${wEdu/100}) + (soft_skills_score × ${wSoft/100})

Thresholds for this job:
- PASS: final_score ≥ ${passThreshold}
- REVIEW: final_score ≥ ${reviewThreshold} and < ${passThreshold}
- FAIL: final_score < ${reviewThreshold}

━━━━━━━━━━━━━━━━━━━━━━━━━━
IMPORTANT ACCURACY RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━
- Be PRECISE and DIFFERENTIATED. Similar resumes for the same job MUST receive different scores if their qualifications differ.
- Do NOT default to 85 for everyone. Scores should reflect genuine gaps and strengths.
- Extract ONLY skills explicitly mentioned in the resume or reasonably inferred from described work.
- Missing_skills must be pulled from the JD requirements — not invented.
- Summary must mention the CANDIDATE'S NAME if visible, specific technologies, and concrete gaps.
- Strengths and weaknesses must be SPECIFIC to this candidate — no generic statements.

━━━━━━━━━━━━━━━━━━━━━━━━━━
REQUIRED OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━
Return ONLY this JSON object — no markdown, no explanations, no code fences:
{
  "score": <final weighted score, 0-100, decimal allowed>,
  "dimension_scores": {
    "technical_skills": <0-100>,
    "experience": <0-100>,
    "education": <0-100>,
    "soft_skills": <0-100>
  },
  "strengths": [<3-5 specific, evidence-based strengths from the resume>],
  "weaknesses": [<2-4 specific gaps vs. the JD requirements>],
  "matched_skills": [<skills from JD that candidate demonstrably has>],
  "missing_skills": [<required skills from JD that candidate lacks>],
  "experience_match": <experience dimension score alias, same as dimension_scores.experience>,
  "education_match": <education dimension score alias, same as dimension_scores.education>,
  "summary": "<3-4 sentence professional assessment: who the candidate is, their key relevant experience, their strongest alignment with the role, and the primary gap or concern>"
}`;

  try {
    const response = await mistral.chat.complete({
      model: process.env.MISTRAL_MODEL || 'mistral-small-latest',
      messages: [
        {
          role: 'system',
          content: 'You are a precision ATS engine. You return ONLY valid JSON with no extra text, no markdown, and no code blocks. Every score must be justified by concrete evidence in the resume.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      responseFormat: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response from Mistral');

    const parsed = JSON.parse(content);
    const score = Math.max(0, Math.min(100, parseFloat(parsed.score) || 0));

    return {
      score,
      status: getStatus(score, criteria),
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 6) : [],
      weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses.slice(0, 5) : [],
      matched_skills: Array.isArray(parsed.matched_skills) ? parsed.matched_skills.slice(0, 25) : [],
      missing_skills: Array.isArray(parsed.missing_skills) ? parsed.missing_skills.slice(0, 20) : [],
      experience_match: Math.max(0, Math.min(100, parseFloat(parsed.experience_match || parsed.dimension_scores?.experience) || 0)),
      education_match: Math.max(0, Math.min(100, parseFloat(parsed.education_match || parsed.dimension_scores?.education) || 0)),
      dimension_scores: parsed.dimension_scores || null,
      summary: parsed.summary || 'Unable to generate summary.',
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
 * Extract a talent profile from raw resume text (for candidate search indexing).
 */
async function extractCandidateProfile(resumeText) {
  const prompt = `You are a resume parser. Extract key information from this resume and return ONLY a valid JSON object.

RESUME:
${resumeText.slice(0, 4000)}

Return ONLY this JSON — no extra text, no markdown:
{
  "skills": [<list of technical and professional skills, max 30 items>],
  "titles": [<list of job titles and roles mentioned or inferred, max 10 items>],
  "experience_years": <total years of professional experience as a number, or null if unclear>,
  "location": "<city or region if mentioned, or null>"
}`;

  try {
    const response = await mistral.chat.complete({
      model: process.env.MISTRAL_MODEL || 'mistral-small-latest',
      messages: [
        { role: 'system', content: 'You are a resume parser AI. Always respond with valid JSON only, no markdown.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      responseFormat: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response');

    const parsed = JSON.parse(content);
    return {
      skills: Array.isArray(parsed.skills) ? parsed.skills.slice(0, 30).map(s => String(s).trim()).filter(Boolean) : [],
      titles: Array.isArray(parsed.titles) ? parsed.titles.slice(0, 10).map(t => String(t).trim()).filter(Boolean) : [],
      experience_years: parsed.experience_years != null ? (parseFloat(parsed.experience_years) || null) : null,
      location: parsed.location ? String(parsed.location).trim() : null,
    };
  } catch (err) {
    logger.warn(`[extractCandidateProfile] Failed: ${err.message} — using empty profile`);
    return { skills: [], titles: [], experience_years: null, location: null };
  }
}

/**
 * Placeholder score when Mistral is unavailable.
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
    dimension_scores: null,
    summary: 'AI scoring unavailable — Mistral API key not set or quota exceeded. Add your MISTRAL_API_KEY to backend/.env.',
  };
}

module.exports = { scoreResume, getStatus, getPlaceholderScore, extractCandidateProfile };
