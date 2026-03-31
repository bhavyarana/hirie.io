const supabase = require('../config/supabase');
const logger = require('../config/logger');

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Returns true for errors caused by network connectivity, not bad credentials */
function isNetworkError(err) {
  if (!err) return false;
  const code = err.code || (err.cause && err.cause.code) || '';
  const msg  = (err.message || '').toLowerCase();
  return (
    code === 'ETIMEDOUT'    ||
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND'    ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    msg.includes('fetch failed')       ||
    msg.includes('network')            ||
    msg.includes('timeout')            ||
    msg.includes('socket')
  );
}

/** Sleep for `ms` milliseconds */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Calls supabase.auth.getUser(token) with up to `maxRetries` retries on
 * network errors. Returns { user, networkError }.
 *   - user          → verified user object (truthy = auth OK)
 *   - networkError  → true if all attempts failed due to connectivity only
 */
async function getSupabaseUserWithRetry(token, maxRetries = 3) {
  let lastErr = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);

      // Supabase returned a proper auth error (bad token, expired, etc.)
      if (error) {
        if (isNetworkError(error)) {
          lastErr = error;
          logger.warn(`Auth: network error on attempt ${attempt}/${maxRetries}`, { message: error.message });
          if (attempt < maxRetries) await sleep(300 * attempt); // 300ms, 600ms
          continue;
        }
        // Genuine auth error — no point retrying
        return { user: null, networkError: false };
      }

      return { user, networkError: false };
    } catch (err) {
      lastErr = err;
      if (isNetworkError(err)) {
        logger.warn(`Auth: network error on attempt ${attempt}/${maxRetries}`, { message: err.message });
        if (attempt < maxRetries) await sleep(300 * attempt);
        continue;
      }
      // Unexpected non-network error
      return { user: null, networkError: false };
    }
  }

  logger.warn('Auth: all retry attempts failed due to network error', { message: lastErr?.message });
  return { user: null, networkError: true };
}

// ── Middleware ─────────────────────────────────────────────────────────────────

/**
 * authMiddleware — verifies Supabase JWT using supabase.auth.getUser()
 * with automatic retries on network failures.
 *
 * Responses:
 *   401  → invalid / expired token (real auth failure)
 *   503  → Supabase auth server unreachable after retries (network issue)
 *   500  → unexpected DB error fetching user record
 */
async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  // ── DEBUG (remove once production auth is confirmed working) ───────────────
  logger.info(`[Auth] ${req.method} ${req.path} — header: ${
    authHeader ? `present (Bearer ${authHeader.slice(7, 17)}…)` : 'MISSING'
  }`);

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.warn(`[Auth] 401 — no Bearer token on ${req.method} ${req.path}`);
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.split(' ')[1];

  // ── Step 1: Verify token (with retries) ────────────────────────────────────
  let user, networkError;
  try {
    ({ user, networkError } = await getSupabaseUserWithRetry(token));
  } catch (err) {
    logger.error('Auth middleware unexpected error', { message: err.message });
    return res.status(500).json({ error: 'Authentication service error' });
  }

  if (networkError) {
    logger.warn(`[Auth] 503 — Supabase unreachable after retries on ${req.method} ${req.path}`);
    // Network issue — don't log the user out, let the client retry
    return res.status(503).json({
      error: 'Authentication service temporarily unavailable',
      code: 'AUTH_NETWORK_ERROR',
      retryable: true,
    });
  }

  if (!user) {
    logger.warn(`[Auth] 401 — invalid/expired token on ${req.method} ${req.path}`);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  logger.info(`[Auth] Token valid — user ${user.id} (${user.email})`);

  // ── Step 2: Fetch role from DB ─────────────────────────────────────────────
  try {
    const { data: userRecord, error: userErr } = await supabase
      .from('users')
      .select('id, email, name, role')
      .eq('id', user.id)
      .single();

    if (userErr || !userRecord) {
      // Auto-create if missing (first login before DB trigger fires)
      const { data: created, error: createErr } = await supabase
        .from('users')
        .upsert({ id: user.id, email: user.email, role: 'recruiter' }, { onConflict: 'id' })
        .select()
        .single();

      if (createErr) {
        logger.error('Failed to create user record', { message: createErr.message });
        return res.status(500).json({ error: 'User record unavailable' });
      }
      req.user = { ...user, ...created, role: created?.role || 'recruiter' };
    } else {
      req.user = { ...user, ...userRecord };
    }

    next();
  } catch (err) {
    logger.error('Auth middleware DB error', { message: err.message });
    return res.status(500).json({ error: 'Authentication service unavailable' });
  }
}

module.exports = authMiddleware;
