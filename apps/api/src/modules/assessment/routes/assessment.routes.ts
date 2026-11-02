import { Router } from 'express';
import { AssessmentController } from '../controllers/assessment.controller.js';
import { requireAuth } from '../../auth/middleware/auth.middleware.js';

const router = Router();

// All assessment lifecycle endpoints require a valid authenticated session
router.use(requireAuth);

router.post('/', AssessmentController.createSession);
router.get('/active', AssessmentController.getActiveSession);
router.get('/:id', AssessmentController.getSessionById);
router.post('/:id/start', AssessmentController.startSession);
router.post('/:id/heartbeat', AssessmentController.heartbeat);
router.post('/:id/submit', AssessmentController.submitSession);

export const assessmentRouter = router;
