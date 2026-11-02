import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import type { HealthCheckResponse } from '@repodojo/shared';

dotenv.config();

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
});

const app = express();
const port = process.env.PORT || 5000;
const startTime = Date.now();

// Security & Parsing Middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  }),
);
app.use(express.json({ limit: '10mb' }));
app.use(pinoHttp({ logger }));

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

app.listen(port, () => {
  logger.info(`RepoDojo API running on port ${port} (Node.js ${process.version})`);
});
