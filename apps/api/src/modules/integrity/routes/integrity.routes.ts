import { Router } from 'express';
import { requireAuth } from '../../auth/middleware/auth.middleware.js';
import { IntegrityController } from '../controllers/integrity.controller.js';

export const integrityRouter = Router();

// Candidate telemetry ingestion (single or batch)
integrityRouter.post('/events', requireAuth, IntegrityController.ingestEvents);

// Timeline and advisory integrity summary retrieval
integrityRouter.get('/session/:sessionId/timeline', requireAuth, IntegrityController.getTimeline);
integrityRouter.get('/session/:sessionId/summary', requireAuth, IntegrityController.getSummary);
