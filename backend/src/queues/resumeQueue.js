const { Queue } = require('bullmq');
const redisConnection = require('../config/redis');

const resumeQueue = new Queue('resume-processing', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});

module.exports = resumeQueue;
