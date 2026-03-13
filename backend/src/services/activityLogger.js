const supabase = require('../config/supabase');
const logger = require('../config/logger');

/**
 * Log an activity event to the activity_logs table and optionally
 * create notifications for target users.
 *
 * @param {string} userId         - UUID of the user performing the action
 * @param {string} action         - e.g. 'job_created', 'resume_uploaded', 'candidate_shortlisted'
 * @param {string} entityType     - e.g. 'job', 'candidate', 'team'
 * @param {string} entityId       - UUID of the entity
 * @param {object} metadata       - arbitrary extra data
 * @param {Array}  notifyUserIds  - optional list of user UUIDs to notify
 * @param {string} notifyTitle    - notification title
 * @param {string} notifyMessage  - notification message body
 */
async function logActivity(
  userId,
  action,
  entityType,
  entityId,
  metadata = {},
  notifyUserIds = [],
  notifyTitle = '',
  notifyMessage = ''
) {
  try {
    await supabase.from('activity_logs').insert({
      user_id: userId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      metadata,
    });
  } catch (err) {
    logger.warn(`activityLogger: failed to log activity "${action}": ${err.message}`);
  }

  if (notifyUserIds.length > 0 && notifyTitle) {
    try {
      const rows = notifyUserIds.map((uid) => ({
        user_id: uid,
        title: notifyTitle,
        message: notifyMessage || '',
        entity_type: entityType,
        entity_id: entityId,
        is_read: false,
      }));
      await supabase.from('notifications').insert(rows);
    } catch (err) {
      logger.warn(`activityLogger: failed to send notifications: ${err.message}`);
    }
  }
}

module.exports = { logActivity };
