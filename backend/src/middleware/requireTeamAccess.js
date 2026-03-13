const supabase = require('../config/supabase');

/**
 * requireTeamAccess(paramName)
 * Middleware that validates the requesting user can access a given team.
 *
 * Rules:
 *   admin   → any team
 *   manager → only teams where manager_id = req.user.id
 *   tl      → only teams where tl_id = req.user.id
 *   recruiter → only teams where they are a member
 *
 * The team id is taken from req.params[paramName] (default: 'teamId')
 *
 * Usage:
 *   router.get('/:teamId', requireTeamAccess(), handler)
 */
function requireTeamAccess(paramName = 'teamId') {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const role = req.user.role;
    const teamId = req.params[paramName];

    if (!teamId) {
      return next(); // no team param, skip (route doesn't require it)
    }

    // Admin bypasses all checks
    if (role === 'admin') return next();

    const { data: team, error } = await supabase
      .from('teams')
      .select('id, manager_id, tl_id')
      .eq('id', teamId)
      .single();

    if (error || !team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    if (role === 'manager') {
      if (team.manager_id !== req.user.id) {
        return res.status(403).json({ error: 'You do not manage this team' });
      }
      req.team = team;
      return next();
    }

    if (role === 'tl') {
      if (team.tl_id !== req.user.id) {
        return res.status(403).json({ error: 'You are not the TL of this team' });
      }
      req.team = team;
      return next();
    }

    // recruiter: check team_members
    const { data: membership } = await supabase
      .from('team_members')
      .select('id')
      .eq('team_id', teamId)
      .eq('user_id', req.user.id)
      .single();

    if (!membership) {
      return res.status(403).json({ error: 'You are not a member of this team' });
    }

    req.team = team;
    return next();
  };
}

module.exports = requireTeamAccess;
