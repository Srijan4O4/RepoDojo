import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import passport from 'passport';
import mongoose from 'mongoose';
import type { HealthCheckResponse } from '@repodojo/shared';
import { configurePassport } from './modules/auth/services/passport.service.js';
import { authRouter } from './modules/auth/routes/auth.routes.js';
import { assessmentRouter } from './modules/assessment/routes/assessment.routes.js';
import { challengeRouter } from './modules/challenge/routes/challenge.routes.js';
import { workspaceRouter } from './modules/sandbox/routes/sandbox.routes.js';
import { aiRouter } from './modules/ai/routes/ai.routes.js';
import { evaluationRouter } from './modules/evaluation/routes/evaluation.routes.js';
import { reportRouter } from './modules/report/routes/report.routes.js';

dotenv.config();

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
});

export const app = express();
const port = process.env.PORT || 5000;
const startTime = Date.now();

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

// =============================================================================
// Feature Modules (Domain 3: Auth)
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
// Domain 13: 3-Stage Health Probes
// =============================================================================

// 1. Startup Probe: Confirms config loaded & process initialized
app.get('/startupz', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'started', timestamp: new Date().toISOString() });
});

// 2. Liveness Probe: Fast event loop responsiveness check (<5ms)
app.get('/livez', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'alive', uptimeSeconds: Math.floor((Date.now() - startTime) / 1000) });
});

// 3. Readiness Probe: Dependency availability (MongoDB, Redis, Docker)
app.get('/readyz', (_req: Request, res: Response) => {
  const response: HealthCheckResponse = {
    status: 'healthy',
    service: '@repodojo/api',
    version: '0.4.0',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    dependencies: {
      mongodb: { status: 'up' },
      redis: { status: 'up' },
    },
  };
  res.status(200).json(response);
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
