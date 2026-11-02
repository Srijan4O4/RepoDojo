import { Router } from 'express';
import { requireAuth } from '../../auth/middleware/auth.middleware.js';
import { ReportController } from '../controllers/report.controller.js';

export const reportRouter = Router();

// Authenticated candidate/admin report endpoints
reportRouter.post('/session/:sessionId/generate', requireAuth, ReportController.generateReport);
reportRouter.get('/session/:sessionId', requireAuth, ReportController.getReport);

// Public unauthenticated shareable link endpoint (Decision 11.2)
reportRouter.get('/shared/:shareToken', ReportController.getSharedReport);
