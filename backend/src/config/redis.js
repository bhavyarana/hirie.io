const { Redis } = require('ioredis');
const logger = require('./logger');

const connection = new Redis({
  host    : process.env.REDIS_HOST || 'localhost',
  port    : parseInt(process.env.REDIS_PORT || '6379'),
  // Password — required for managed Redis providers (Upstash, Railway, Redis Cloud)
  password: process.env.REDIS_PASSWORD || undefined,
  // TLS — required for managed Redis over the internet
  tls     : process.env.REDIS_TLS === 'true' ? {} : undefined,

  // BullMQ requirement: don't block on commands that must be retried
  maxRetriesPerRequest: null,
  enableReadyCheck    : false,

  // Reconnect strategy — exponential back-off, cap at 2 s
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    logger.warn(`[Redis] Reconnecting (attempt ${times}), retry in ${delay}ms`);
    return delay;
  },
});

connection.on('connect', () => logger.info('[Redis] Connected'));
connection.on('ready',   () => logger.info('[Redis] Ready'));
connection.on('error',   (err) => logger.error(`[Redis] Error: ${err.message}`));
connection.on('close',   () => logger.warn('[Redis] Connection closed'));
connection.on('reconnecting', () => logger.warn('[Redis] Reconnecting…'));

module.exports = connection;
