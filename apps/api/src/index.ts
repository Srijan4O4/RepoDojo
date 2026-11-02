import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import passport from 'passport';
import mongoose from 'mongoose';
import { configurePassport } from './modules/auth/services/passport.service.js';
import { authRouter } from './modules/auth/routes/auth.routes.js';
import { assessmentRouter } from './modules/assessment/routes/assessment.routes.js';
import { challengeRouter } from './modules/challenge/routes/challenge.routes.js';
import { workspaceRouter } from './modules/sandbox/routes/sandbox.routes.js';
import { aiRouter } from './modules/ai/routes/ai.routes.js';
import { evaluationRouter } from './modules/evaluation/routes/evaluation.routes.js';
import { reportRouter } from './modules/report/routes/report.routes.js';
import { correlationMiddleware } from './modules/observability/middleware/correlation.middleware.js';
import { enforceNetworkBoundary } from './modules/security/middleware/network-boundary.middleware.js';
import { HealthController } from './modules/observability/controllers/health.controller.js';
import { AlertService } from './modules/observability/services/alert.service.js';

dotenv.config();

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
});

export const app = express();
const port = process.env.PORT || 5000;

// Configure Passport Strategies
configurePassport();

// Security & Parsing Middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(passport.initialize());
app.use(pinoHttp({ logger }));
app.use(correlationMiddleware);
app.use(enforceNetworkBoundary);

// =============================================================================
// Feature Modules (Domains 3, 4, 5, 6, 8, 10, 11)
// =============================================================================
app.use('/api/auth', authRouter);
app.use('/api/assessments', assessmentRouter);
app.use('/api/challenges', challengeRouter);
app.use('/api/workspace', workspaceRouter);
app.use('/api/sandboxes', workspaceRouter);
app.use('/api/ai', aiRouter);
app.use('/api/evaluations', evaluationRouter);
app.use('/api/reports', reportRouter);

// =============================================================================
// Domain 13: 3-Stage Health Probes & Alert Diagnostics
// =============================================================================

// 1. Startup Probe: Confirms config loaded & process initialized
app.get('/startupz', HealthController.startupCheck);

// 2. Liveness Probe: Fast event loop responsiveness check (<5ms)
app.get('/livez', HealthController.livenessCheck);

// 3. Readiness Probe: Deep dependency check (MongoDB, Redis, AI Service)
app.get('/readyz', HealthController.readinessCheck);

// 4. Operational Alert Diagnostic Stream
app.get('/api/observability/alerts', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'success', alerts: AlertService.getRecentAlerts() });
});

// Root ping
app.get('/', (_req: Request, res: Response) => {
  res.json({ message: 'RepoDojo API Server', version: '0.4.0', status: 'operational' });
});

if (process.env.NODE_ENV !== 'test') {
  const mongoUri = process.env.MONGODB_URI;
  if (mongoUri) {
    mongoose
      .connect(mongoUri)
      .then(() => {
        logger.info('Connected to MongoDB');
      })
      .catch((err) => {
        logger.error({ err }, 'Failed to connect to MongoDB');
      });
  }

  app.listen(port, () => {
    logger.info(`RepoDojo API running on port ${port} (Node.js ${process.version})`);
  });
}
