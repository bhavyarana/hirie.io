require('dotenv').config();
require('express-async-errors');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const redisConnection = require('./config/redis');
const supabase = require('./config/supabase');

const jobsRouter = require('./routes/jobs');
const resumesRouter = require('./routes/resumes');
const analyticsRouter = require('./routes/analytics');
const exportRouter = require('./routes/export');
const parseJdRouter = require('./routes/parseJd');
const usersRouter = require('./routes/users');
const teamsRouter = require('./routes/teams');
const notificationsRouter = require('./routes/notifications');
const jobAssignmentsRouter = require('./routes/jobAssignments');
const talentPoolRouter = require('./routes/talentPool');
const submissionsRouter = require('./routes/submissions');
const logger = require('./config/logger');

// ── Worker is a SEPARATE process in production ────────────────────────────────
// Run `npm run worker` in its own process/container.
// This keeps the API stateless and horizontally scalable.

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Health check — verifies Redis + Supabase connectivity ────────────────────
// Used by load balancers, container orchestrators (k8s liveness probe), and uptime monitors.
app.get('/health', async (req, res) => {
  const checks = {};
  let healthy = true;

  // Redis ping
  try {
    await redisConnection.ping();
    checks.redis = 'ok';
  } catch (err) {
    checks.redis = `error: ${err.message}`;
    healthy = false;
  }

  // Supabase reachability
  try {
    const { error } = await supabase.from('users').select('id').limit(1);
    if (error) throw error;
    checks.supabase = 'ok';
  } catch (err) {
    checks.supabase = `error: ${err.message}`;
    healthy = false;
  }

  const status = healthy ? 200 : 503;
  res.status(status).json({
    status: healthy ? 'ok' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
  });
});

// Routes (existing)
app.use('/api/jobs', jobsRouter);
app.use('/api', resumesRouter);
app.use('/api', analyticsRouter);
app.use('/api', exportRouter);
app.use('/api', parseJdRouter);

// Routes (new RBAC)
app.use('/api/users', usersRouter);
app.use('/api/teams', teamsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/job-assignments', jobAssignmentsRouter);
app.use('/api/talent-pool', talentPoolRouter);
app.use('/api/submissions', submissionsRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', { message: err.message, stack: err.stack });
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

const server = createServer(app);
server.listen(PORT, () => {
  logger.info(`Hirie.io API running on port ${PORT}`);
});

module.exports = app;
