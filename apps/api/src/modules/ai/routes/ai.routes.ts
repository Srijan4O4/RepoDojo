import { Router } from 'express';
import { AIController } from '../controllers/ai.controller.js';
import { requireAuth } from '../../auth/middleware/auth.middleware.js';

const router = Router();

router.use(requireAuth);

router.post('/chat/stream', AIController.streamChat);
router.get('/session/:sessionId/budget', AIController.getBudget);
router.get('/session/:sessionId/history', AIController.getHistory);

export const aiRouter = router;
