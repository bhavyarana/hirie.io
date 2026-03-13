/**
 * requireRole(...roles)
 * Factory middleware that returns 403 unless req.user.role is in the allowed list.
 *
 * Usage:
 *   router.post('/', requireRole('admin', 'manager'), handler)
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Required role: ${roles.join(' or ')}. Your role: ${req.user.role}`,
      });
    }
    next();
  };
}

module.exports = requireRole;
