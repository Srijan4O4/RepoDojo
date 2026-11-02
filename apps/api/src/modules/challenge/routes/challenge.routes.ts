import { Router } from 'express';
import { ChallengeController } from '../controllers/challenge.controller.js';
import { requireAuth, requireRole } from '../../auth/middleware/auth.middleware.js';

const router = Router();

router.get('/', ChallengeController.listChallenges);
router.get('/:id', ChallengeController.getChallengeById);

// Admin-only synchronization endpoint
router.post('/sync', requireAuth, requireRole('admin'), ChallengeController.syncChallenge);

export const challengeRouter = router;
