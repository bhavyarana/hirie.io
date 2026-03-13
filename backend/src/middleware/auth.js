const supabase = require('../config/supabase');
const logger = require('../config/logger');

/**
 * Middleware to verify Supabase JWT and attach user + role to req.user
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

    // Fetch user record (role, name) from public.users table
    const { data: userRecord, error: userErr } = await supabase
      .from('users')
      .select('id, email, name, role')
      .eq('id', user.id)
      .single();

    if (userErr || !userRecord) {
      // Auto-create user record if missing (first login before trigger fires)
      const { data: created, error: createErr } = await supabase
        .from('users')
        .upsert({ id: user.id, email: user.email, role: 'recruiter' }, { onConflict: 'id' })
        .select()
        .single();

      if (createErr) {
        logger.error('Failed to create user record:', createErr.message);
        return res.status(500).json({ error: 'User record unavailable' });
      }
      req.user = { ...user, ...created, role: created?.role || 'recruiter' };
    } else {
      req.user = { ...user, ...userRecord };
    }

    next();
  } catch (err) {
    logger.error('Auth middleware error:', err.message);
    return res.status(500).json({ error: 'Authentication service unavailable' });
  }
}

module.exports = authMiddleware;
