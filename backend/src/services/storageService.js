const supabase = require('../config/supabase');
const logger = require('../config/logger');

/**
 * Upload a file buffer to Supabase Storage
 */
async function uploadFile(buffer, storagePath, mimeType) {
  const { data, error } = await supabase.storage
    .from('resumes')
    .upload(storagePath, buffer, {
      contentType: mimeType,
      upsert: true,
    });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return data;
}

/**
 * Download a file from Supabase Storage as a Buffer
 */
async function downloadFile(storagePath) {
  const { data, error } = await supabase.storage
    .from('resumes')
    .download(storagePath);

  if (error) throw new Error(`Storage download failed: ${error.message}`);

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Get a signed URL for a file in Supabase Storage
 */
async function getSignedUrl(storagePath, expiresIn = 3600) {
  const { data, error } = await supabase.storage
    .from('resumes')
    .createSignedUrl(storagePath, expiresIn);

  if (error) throw new Error(`Signed URL generation failed: ${error.message}`);
  return data.signedUrl;
}

module.exports = { uploadFile, downloadFile, getSignedUrl };
