const { Redis } = require('ioredis');
const logger = require('./logger');

// Upstash TCP tab provides a single REDIS_URL (rediss://...)
// The "rediss://" scheme automatically enables TLS.
// Fall back to individual host/port/password for local dev.
const redisOptions = {
  // BullMQ requirement: don't block on commands that must be retried
  maxRetriesPerRequest: null,
  enableReadyCheck    : false,

  // Reconnect strategy — exponential back-off, cap at 2 s
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    logger.warn(`[Redis] Reconnecting (attempt ${times}), retry in ${delay}ms`);
    return delay;
  },
};

const connection = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, redisOptions)
  : new Redis({
      host    : process.env.REDIS_HOST || 'localhost',
      port    : parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      tls     : process.env.REDIS_TLS === 'true' ? {} : undefined,
      ...redisOptions,
    });

connection.on('connect', () => logger.info('[Redis] Connected'));
connection.on('ready',   () => logger.info('[Redis] Ready'));
connection.on('error',   (err) => logger.error(`[Redis] Error: ${err.message}`));
connection.on('close',   () => logger.warn('[Redis] Connection closed'));
connection.on('reconnecting', () => logger.warn('[Redis] Reconnecting…'));

module.exports = connection;
