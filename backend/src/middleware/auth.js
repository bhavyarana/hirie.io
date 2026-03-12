const supabase = require('../config/supabase');
const logger = require('../config/logger');

/**
 * Middleware to verify Supabase JWT and attach user to req.user
 */
async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      logger.warn('Auth failed:', error?.message);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = user;
    next();
  } catch (err) {
    logger.error('Auth middleware error:', err.message);
    return res.status(500).json({ error: 'Authentication service unavailable' });
  }
}

module.exports = authMiddleware;
