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

// ─── Mistral OCR API fallback (scanned PDF) ──────────────────────────────────

/**
 * Send the raw PDF buffer directly to Mistral's dedicated OCR API
 * (mistral-ocr-latest).  No native binaries, no image conversion, no
 * per-page loops — a single HTTP call handles the whole document.
 * Used only when pdf-parse yields < MIN_WORD_COUNT words.
 */
async function extractWithMistralOCR(buffer) {
  try {
    logger.info('[Parser] Invoking Mistral OCR API for scanned PDF…');

    const base64Pdf = buffer.toString('base64');

    const ocrResponse = await mistral.ocr.process({
      model   : 'mistral-ocr-latest',
      document: {
        type       : 'document_url',
        documentUrl: `data:application/pdf;base64,${base64Pdf}`,
      },
    });

    // ocrResponse.pages → [{ index, markdown, … }, …]
    const fullText = (ocrResponse.pages || [])
      .map(p => p.markdown || '')
      .join('\n\n');

    logger.info(`[Parser] Mistral OCR extracted ${wordCount(fullText)} words`);
    return fullText;
  } catch (err) {
    logger.warn('[Parser] Mistral OCR failed:', err.message);
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
      logger.info('[Parser] Sparse text — attempting Mistral OCR API fallback');
      const ocrText = await extractWithMistralOCR(buffer);
      if (wordCount(ocrText) > words) {
        logger.info('[Parser] Mistral OCR produced better text — using it');
        text = ocrText;
      } else {
        logger.warn('[Parser] Mistral OCR did not improve text — keeping original');
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
