const pdfParse = require('pdf-parse');
const mammoth  = require('mammoth');
const logger   = require('../config/logger');
const mistral  = require('../config/openai'); // Mistral client

const MIN_WORD_COUNT = 30; // below this → treat as scanned PDF → Vision OCR

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

    for (const page of pages.slice(0, 5)) {
      const imgBuffer = page.buffer || page;
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
                  type    : 'image_url',
                  imageUrl: { url: `data:image/png;base64,${base64Img}` },
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

// ─── Regex-based hints (fast, free — used to seed the AI call) ───────────────

/**
 * Normalise an Indian mobile number to 10 digits.
 * Returns null if the number doesn't look valid.
 */
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
 * Fast regex scan for an Indian mobile number.
 * Returns 10-digit string or null.
 */
function extractPhone(text) {
  for (const line of text.split('\n')) {
    const stripped = line.replace(/[^\d\s+\-.]/gi, '').trim();
    if (!stripped) continue;
    const cleaned = stripped
      .replace(/^\+?(?:00)?91[\s\-.]*/, '')
      .replace(/[\s\-.]/g, '');
    const a = normalisePhone(cleaned);
    if (a) return a;
    const b = normalisePhone(line.replace(/\D/g, ''));
    if (b) return b;
  }
  return null;
}

/**
 * Fast regex scan for an email address.
 */
function extractEmail(text) {
  const m = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m ? m[0] : null;
}

// ─── Main extraction pipeline ─────────────────────────────────────────────────

/**
 * Extract raw text from a resume buffer.
 * Returns { text, hints } where hints are cheap regex-derived values
 * (email + phone) that will be passed to the AI mega-call as seeds.
 *
 * Name extraction is intentionally left to the AI — regex-based name
 * extraction is unreliable and responsible for the majority of wrong names.
 */
async function extractResumeText(buffer, mimeType) {
  let text = '';

  if (mimeType === 'application/pdf') {
    text = await extractFromPDF(buffer);
    const words = wordCount(text);
    logger.info(`[Parser] pdf-parse extracted ${words} words`);

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

  // Cheap regex hints — passed to AI as seeds, NOT stored as final values
  const hints = {
    email: extractEmail(normalized),
    phone: extractPhone(normalized),
  };

  logger.info(`[Parser] Regex hints → email:${hints.email || 'none'}, phone:${hints.phone || 'none'}`);

  return { text: normalized, hints };
}

module.exports = { extractResumeText, normalizeText };
