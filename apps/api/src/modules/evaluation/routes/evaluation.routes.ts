import { Router } from 'express';
import { requireAuth } from '../../auth/middleware/auth.middleware.js';
import { EvaluationController } from '../controllers/evaluation.controller.js';

export const evaluationRouter = Router();

// Internal trusted worker evaluation ingestion route (authenticated via X-RepoDojo-Worker-Auth)
evaluationRouter.post('/internal/worker-result', EvaluationController.ingestWorkerResult);

// Candidate or Admin evaluation routes (authenticated via JWT)
evaluationRouter.post('/session/:sessionId/submit', requireAuth, EvaluationController.submitAndEvaluate);
evaluationRouter.get('/session/:sessionId', requireAuth, EvaluationController.getEvaluation);
