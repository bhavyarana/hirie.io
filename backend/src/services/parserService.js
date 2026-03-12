const pdfParse = require('pdf-parse');
const mammoth  = require('mammoth');
const logger   = require('../config/logger');
const mistral  = require('../config/openai'); // Mistral client

const MIN_TEXT_LENGTH = 150;
const MIN_WORD_COUNT  = 30;   // below this → treat as scanned PDF → Vision OCR

// ─── PDF / DOCX text extraction ───────────────────────────────────────────────

async function extractFromPDF(buffer) {
  try {
    const data = await pdfParse(buffer);
    return data.text || '';
  } catch (err) {
    logger.warn('[Parser] pdf-parse failed:', err.message);
    return '';
  }
}

async function extractFromDOCX(buffer) {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  } catch (err) {
    logger.warn('[Parser] mammoth failed:', err.message);
    return '';
  }
}

// ─── Text normalisation ───────────────────────────────────────────────────────

function normalizeText(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function wordCount(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

// ─── Mistral Vision OCR (scanned PDF fallback) ───────────────────────────────

/**
 * Convert PDF pages to PNG images using pdf2pic and send each page to
 * Mistral's pixtral vision model for text extraction.
 * Used when standard pdf-parse yields < MIN_WORD_COUNT words.
 */
async function extractWithMistralVision(buffer) {
  try {
    logger.info('[Parser] Invoking Mistral Vision OCR for scanned PDF…');
    const pdf2pic = require('pdf2pic');

    // Render each page to a PNG buffer (density=200 → crisp 200dpi raster)
    const convert = pdf2pic.fromBuffer(buffer, {
      density    : 200,
      saveFilename: 'page',
      savePath   : require('os').tmpdir(),
      format     : 'png',
      width      : 1800,
      height     : 2400,
    });

    let pages;
    try {
      pages = await convert.bulk(-1, { responseType: 'buffer' });
    } catch (convertErr) {
      logger.warn('[Parser] pdf2pic convert failed:', convertErr.message);
      return '';
    }

    if (!pages || pages.length === 0) {
      logger.warn('[Parser] pdf2pic returned no pages');
      return '';
    }

    let fullText = '';

    // Process up to 5 pages with Mistral vision
    for (const page of pages.slice(0, 5)) {
      const imgBuffer  = page.buffer || page;
      if (!imgBuffer || !Buffer.isBuffer(imgBuffer)) continue;

      const base64Img = imgBuffer.toString('base64');

      try {
        const response = await mistral.chat.complete({
          model: 'pixtral-12b-2409',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text:
                    'This is a page from a resume. Extract ALL text exactly as it appears: ' +
                    'name, address, phone, email, summary, experience, education, skills. ' +
                    'Return ONLY the raw extracted text — no extra commentary.',
                },
                {
                  type     : 'image_url',
                  imageUrl : { url: `data:image/png;base64,${base64Img}` },
                },
              ],
            },
          ],
          temperature: 0,
        });

        const pageText = response.choices[0]?.message?.content;
        if (pageText) fullText += pageText + '\n\n';
      } catch (visionErr) {
        logger.warn('[Parser] Mistral Vision page error:', visionErr.message);
      }
    }

    logger.info(`[Parser] Vision OCR extracted ${wordCount(fullText)} words`);
    return fullText;
  } catch (err) {
    logger.warn('[Parser] Mistral Vision OCR failed:', err.message);
    return '';
  }
}

// ─── Phone normalisation ──────────────────────────────────────────────────────

function normalisePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  let local = digits;
  if (local.startsWith('0091') && local.length >= 14) local = local.slice(4);
  else if (local.startsWith('91') && local.length === 12) local = local.slice(2);
  else if (local.startsWith('0')  && local.length === 11) local = local.slice(1);
  return /^[6-9]\d{9}$/.test(local) ? local : null;
}

/**
 * Scan every line trying to extract a valid Indian 10-digit mobile number.
 * Handles: "+91 79811 64305", "919576588635", "9494 799 143", "+91-98765-43210"
 */
function extractPhone(text) {
  for (const line of text.split('\n')) {
    // Strip everything except digits, +, spaces, dashes
    const stripped = line.replace(/[^\d\s+\-.]/gi, '').trim();
    if (!stripped) continue;

    // Remove leading country code (+91 / 0091 / 91) then collapse whitespace/dashes
    const cleaned = stripped
      .replace(/^\+?(?:00)?91[\s\-.]*/, '')
      .replace(/[\s\-.]/g, '');

    const a = normalisePhone(cleaned);
    if (a) return a;

    // Also try raw digits of the whole line (catches "919576588635")
    const b = normalisePhone(line.replace(/\D/g, ''));
    if (b) return b;
  }
  return null;
}

// ─── Name extraction ──────────────────────────────────────────────────────────

const NON_NAME_KEYWORDS = [
  'developer', 'engineer', 'manager', 'designer', 'analyst', 'architect',
  'consultant', 'director', 'officer', 'executive', 'specialist', 'lead',
  'senior', 'junior', 'intern', 'associate', 'coordinator', 'administrator',
  'address', 'present', 'permanent', 'current', 'city', 'state', 'country',
  'street', 'avenue', 'road', 'lane', 'nagar', 'colony', 'sector', 'district',
  'email', 'phone', 'mobile', 'contact', 'tel', 'fax', 'linkedin', 'github',
  'objective', 'summary', 'profile', 'experience', 'education', 'skills',
  'resume', 'curriculum', 'vitae', 'cv', 'portfolio',
  'software', 'hardware', 'technology', 'technologies', 'solutions', 'systems',
  'university', 'college', 'institute', 'school', 'academy',
  'date', 'dob', 'birth', 'nationality', 'gender', 'marital',
  'hyderabad', 'bangalore', 'mumbai', 'delhi', 'chennai', 'pune', 'india',
];

const NAME_PATTERN = /^([A-Z][a-zA-Z'-]{1,})(?: [A-Z][a-zA-Z'-]{1,}){1,3}$/;

function extractName(text) {
  const lines = text.split('\n').slice(0, 25).filter(l => l.trim().length > 2);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 3 || trimmed.length > 55) continue;
    const lower = trimmed.toLowerCase();
    if (NON_NAME_KEYWORDS.some(kw => lower.includes(kw))) continue;
    if (/[@:/\\]/.test(trimmed)) continue;
    if (/\d{4,}/.test(trimmed)) continue;
    if (/[,;|#*()[\]{}_<>]/.test(trimmed)) continue;
    if (NAME_PATTERN.test(trimmed)) return trimmed;
  }
  return null;
}

function extractEmail(text) {
  const m = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m ? m[0] : null;
}

function extractBasicInfo(text) {
  return {
    name : extractName(text),
    email: extractEmail(text),
    phone: extractPhone(text),
  };
}

// ─── Mistral AI contact-info fallback ────────────────────────────────────────

/**
 * When regex extraction misses any contact field, send the first 2000 chars
 * of resume text to Mistral (text model) and recover the missing fields.
 */
async function extractBasicInfoWithAI(text, partial) {
  if (partial.name && partial.email && partial.phone) return partial; // nothing missing

  const missing = [];
  if (!partial.name)  missing.push('"full_name": "<candidate full name only, no job title>"');
  if (!partial.email) missing.push('"email_address": "<email>"');
  if (!partial.phone) missing.push('"phone_number": "<10-digit Indian mobile, strip +91/91, no spaces/dashes>"');

  logger.info(`[Parser] AI info fallback — missing: ${missing.map(m => m.split(':')[0]).join(', ')}`);

  try {
    const response = await mistral.chat.complete({
      model: process.env.MISTRAL_MODEL || 'mistral-small-latest',
      messages: [
        {
          role   : 'system',
          content: 'You extract contact information from resume text. Respond with ONLY a valid JSON object, no markdown.',
        },
        {
          role   : 'user',
          content:
            'Extract the following fields from this resume text.\n' +
            'Return ONLY a JSON object with these exact keys:\n' +
            `{\n  ${missing.join(',\n  ')}\n}\n` +
            'If a field cannot be found, use null.\n\n' +
            `RESUME TEXT:\n${text.slice(0, 2000)}`,
        },
      ],
      temperature    : 0,
      responseFormat : { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty AI response');
    const parsed = JSON.parse(content);

    const result = { ...partial };
    if (!result.name  && parsed.full_name)     result.name  = String(parsed.full_name).trim();
    if (!result.email && parsed.email_address) result.email = String(parsed.email_address).trim();
    if (!result.phone && parsed.phone_number) {
      result.phone = normalisePhone(String(parsed.phone_number));
    }

    logger.info(`[Parser] AI info result → name:${result.name}, email:${result.email}, phone:${result.phone}`);
    return result;
  } catch (err) {
    logger.warn('[Parser] AI info fallback failed:', err.message);
    return partial;
  }
}

// ─── Main extraction pipeline ─────────────────────────────────────────────────

async function extractResumeText(buffer, mimeType) {
  let text = '';

  if (mimeType === 'application/pdf') {
    text = await extractFromPDF(buffer);
    const words = wordCount(text);
    logger.info(`[Parser] pdf-parse extracted ${words} words`);

    // Case 1: very little text → likely scanned PDF → Mistral Vision OCR
    if (words < MIN_WORD_COUNT) {
      logger.info('[Parser] Sparse text — attempting Mistral Vision OCR fallback');
      const visionText = await extractWithMistralVision(buffer);
      if (wordCount(visionText) > words) {
        logger.info('[Parser] Vision OCR produced better text — using it');
        text = visionText;
      } else {
        logger.warn('[Parser] Vision OCR did not improve text — keeping original');
      }
    }
  } else if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword'
  ) {
    text = await extractFromDOCX(buffer);
  }

  const normalized = normalizeText(text);

  // Step 1: fast regex-based extraction
  let basicInfo = extractBasicInfo(normalized);

  // Case 2: any field missing → Mistral text model fallback
  basicInfo = await extractBasicInfoWithAI(normalized, basicInfo);

  return { text: normalized, basicInfo };
}

module.exports = { extractResumeText, normalizeText };
