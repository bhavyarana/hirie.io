const { Redis } = require('ioredis');
const logger = require('./logger');

const connection = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

connection.on('connect', () => logger.info('Redis connected'));
connection.on('error', (err) => logger.error('Redis error:', err.message));

module.exports = connection;
