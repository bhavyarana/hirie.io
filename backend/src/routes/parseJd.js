const express = require('express');
const router = express.Router();
const multer = require('multer');
const mammoth = require('mammoth');
const mistral = require('../config/openai'); // now Mistral client
const authMiddleware = require('../middleware/auth');
const logger = require('../config/logger');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain',
    ];
    cb(null, allowed.includes(file.mimetype));
  },
});

/**
 * Extract text from a PDF buffer — 3-step fallback chain
 * 1. pdf-parse (fast)
 * 2. pdfjs-dist (robust, handles non-standard encodings)
 * 3. Raw ASCII extraction (last resort)
 */
async function extractPdfText(buffer) {
  // Attempt 1: pdf-parse
  try {
    const pdfParse = require('pdf-parse');
    const result = await pdfParse(buffer);
    if (result.text && result.text.trim().length > 40) {
      logger.info('PDF extracted via pdf-parse');
      return result.text.trim();
    }
  } catch (err) {
    logger.warn(`pdf-parse failed (${err.message}), trying pdfjs-dist…`);
  }

  // Attempt 2: pdfjs-dist (try multiple entry points for different versions)
  try {
    let pdfjsLib;
    try {
      pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
    } catch {
      try {
        pdfjsLib = require('pdfjs-dist');
      } catch {
        pdfjsLib = require('pdfjs-dist/build/pdf');
      }
    }

    const uint8Array = new Uint8Array(buffer);
    const loadingTask = pdfjsLib.getDocument({ data: uint8Array, verbosity: 0 });
    const pdf = await loadingTask.promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map(item => item.str).join(' '));
    }
    const text = pages.join('\n').trim();
    if (text.length > 40) {
      logger.info('PDF extracted via pdfjs-dist');
      return text;
    }
  } catch (err) {
    logger.warn(`pdfjs-dist failed (${err.message.slice(0, 80)}), trying raw extraction…`);
  }

  // Attempt 3: Raw ASCII fallback
  try {
    const raw = buffer.toString('latin1');
    const text = (raw.match(/[\x20-\x7E]{4,}/g) || [])
      .filter(c => /[a-zA-Z]{3,}/.test(c))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length > 40) {
      logger.info('PDF extracted via raw ASCII');
      return text;
    }
  } catch (err) {
    logger.warn(`Raw extraction failed: ${err.message}`);
  }

  return null;
}

// POST /api/parse-jd/text — Parse raw pasted JD text with Mistral AI (no file upload needed)
router.post('/parse-jd/text', authMiddleware, async (req, res) => {
  const { text } = req.body || {};
  if (!text || typeof text !== 'string' || text.trim().length < 50) {
    return res.status(400).json({ error: 'Please provide at least 50 characters of job description text.' });
  }

  try {
    const truncated = text.trim().slice(0, 8000);
    logger.info(`Raw text paste: ${truncated.length} chars. Sending to Mistral…`);

    let parsed = null;
    let aiError = null;

    try {
      const response = await mistral.chat.complete({
        model: process.env.MISTRAL_MODEL || 'mistral-small-latest',
        messages: [
          {
            role: 'system',
            content: 'You extract job details from text and return ONLY valid JSON. No markdown.',
          },
          {
            role: 'user',
            content: `Extract from this job description. Return ONLY this JSON:
{
  "job_title": "<role name>",
  "company_name": "<company, or empty string>",
  "job_description_text": "<full description, cleaned>",
  "required_skills": ["skill1", "skill2"]
}
Extract 5-15 technical skills. JD TEXT:\n${truncated}`,
          },
        ],
        temperature: 0.1,
        responseFormat: { type: 'json_object' },
      });

      parsed = JSON.parse(response.choices[0]?.message?.content || '{}');
      logger.info(`Mistral parsed (text): "${parsed.job_title}" | ${parsed.required_skills?.length ?? 0} skills`);
    } catch (err) {
      aiError = err.message || String(err);
      logger.warn(`Mistral unavailable (${aiError.slice(0, 60)}) — returning raw text`);
    }

    if (parsed) {
      return res.json({
        job_title: (parsed.job_title || '').trim(),
        company_name: (parsed.company_name || '').trim(),
        job_description_text: (parsed.job_description_text || truncated).trim(),
        required_skills: Array.isArray(parsed.required_skills) ? parsed.required_skills.slice(0, 20) : [],
        ai_available: true,
      });
    }

    // Graceful fallback
    const isKeyMissing = !process.env.MISTRAL_API_KEY || aiError?.includes('API key');
    return res.json({
      job_title: '',
      company_name: '',
      job_description_text: truncated.trim(),
      required_skills: [],
      ai_available: false,
      ai_error: isKeyMissing
        ? 'Mistral API key not configured. Add MISTRAL_API_KEY to backend/.env. Job description was pre-filled from your text.'
        : `AI parsing unavailable: ${aiError?.slice(0, 100)}. Job description pre-filled from your text.`,
    });
  } catch (err) {
    logger.error('JD text parse error:', err.message);
    res.status(500).json({ error: `Parsing failed: ${err.message}` });
  }
});

// POST /api/parse-jd — Upload JD, extract text, parse with Mistral AI
router.post('/parse-jd', authMiddleware, upload.single('jd'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    let rawText = '';
    const { mimetype, buffer } = req.file;

    if (mimetype === 'application/pdf') {
      rawText = (await extractPdfText(buffer)) || '';
    } else if (mimetype.includes('wordprocessingml') || mimetype === 'application/msword') {
      const result = await mammoth.extractRawText({ buffer });
      rawText = result.value || '';
    } else if (mimetype === 'text/plain') {
      rawText = buffer.toString('utf-8');
    }

    if (!rawText || rawText.trim().length < 50) {
      return res.status(422).json({
        error: 'Could not extract readable text from this file. Try copying the JD text and pasting it directly.',
      });
    }

    logger.info(`Extracted ${rawText.length} chars. Sending to Mistral…`);
    const truncated = rawText.slice(0, 8000);

    let parsed = null;
    let aiError = null;

    try {
      const response = await mistral.chat.complete({
        model: process.env.MISTRAL_MODEL || 'mistral-small-latest',
        messages: [
          {
            role: 'system',
            content: 'You extract job details from text and return ONLY valid JSON. No markdown.',
          },
          {
            role: 'user',
            content: `Extract from this job description. Return ONLY this JSON:
{
  "job_title": "<role name>",
  "company_name": "<company, or empty string>",
  "job_description_text": "<full description, cleaned>",
  "required_skills": ["skill1", "skill2"]
}
Extract 5-15 technical skills. JD TEXT:\n${truncated}`,
          },
        ],
        temperature: 0.1,
        responseFormat: { type: 'json_object' },
      });

      parsed = JSON.parse(response.choices[0]?.message?.content || '{}');
      logger.info(`Mistral parsed: "${parsed.job_title}" | ${parsed.required_skills?.length ?? 0} skills`);
    } catch (err) {
      aiError = err.message || String(err);
      logger.warn(`Mistral unavailable (${aiError.slice(0, 60)}) — returning raw text`);
    }

    if (parsed) {
      return res.json({
        job_title: (parsed.job_title || '').trim(),
        company_name: (parsed.company_name || '').trim(),
        job_description_text: (parsed.job_description_text || rawText).trim(),
        required_skills: Array.isArray(parsed.required_skills) ? parsed.required_skills.slice(0, 20) : [],
        ai_available: true,
      });
    }

    // Graceful fallback — pre-fill description, user fills title/company
    const isKeyMissing = !process.env.MISTRAL_API_KEY || aiError?.includes('API key');
    return res.json({
      job_title: '',
      company_name: '',
      job_description_text: truncated.trim(),
      required_skills: [],
      ai_available: false,
      ai_error: isKeyMissing
        ? 'Mistral API key not configured. Add MISTRAL_API_KEY to backend/.env. Job description was pre-filled from your PDF.'
        : `AI parsing unavailable: ${aiError?.slice(0, 100)}. Job description pre-filled from PDF.`,
    });
  } catch (err) {
    logger.error('JD parse error:', err.message);
    res.status(500).json({ error: `Parsing failed: ${err.message}` });
  }
});

module.exports = router;
