import { Router } from 'express';
import { requireAuth } from '../../auth/middleware/auth.middleware.js';
import { EvaluationController } from '../controllers/evaluation.controller.js';

export const evaluationRouter = Router();

// Candidate or Admin evaluation routes
evaluationRouter.post('/session/:sessionId/submit', requireAuth, EvaluationController.submitAndEvaluate);
evaluationRouter.get('/session/:sessionId', requireAuth, EvaluationController.getEvaluation);
