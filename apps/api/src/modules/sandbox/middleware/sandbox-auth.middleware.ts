import { Request, Response, NextFunction } from 'express';
import { AssessmentModel, IAssessment } from '../../assessment/models/assessment.model.js';

declare global {
  namespace Express {
    interface Request {
      assessmentSession?: IAssessment;
    }
  }
}

export interface SessionAccessOptions {
  requireActiveForMutation?: boolean;
}

/**
 * Shared session access and lifecycle authorization middleware (SEC-02).
 * Verifies:
 * 1. Session exists.
 * 2. Requesting user owns session (or has admin role).
 * 3. Session lifecycle state allows requested operation (immutable once submitted/completed/timed-out).
 */
export function requireSessionAccess(options: SessionAccessOptions = {}) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const sessionId = req.params.sessionId;
    if (!sessionId) {
      res.status(400).json({ error: 'MISSING_SESSION_ID', message: 'Session ID parameter is required.' });
      return;
    }

    const candidateId = req.user?.sub || req.user?.id || req.user?._id;
    const role = req.user?.role;

    if (!candidateId) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required.' });
      return;
    }

    const session = await AssessmentModel.findById(sessionId);
    if (!session) {
      res.status(404).json({ error: 'SESSION_NOT_FOUND', message: 'Assessment session not found.' });
      return;
    }

    // Strict ownership verification: candidateId must match authenticated user
    if (session.candidateId.toString() !== candidateId.toString() && role !== 'admin') {
      res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Access denied: You do not own this assessment session.',
      });
      return;
    }

    // Lifecycle state verification: block mutations on immutable sessions
    if (options.requireActiveForMutation) {
      const activeStates = ['CREATED', 'PROVISIONING', 'READY', 'IN_PROGRESS'];
      if (!activeStates.includes(session.status)) {
        res.status(409).json({
          error: 'SESSION_IMMUTABLE',
          message: `Assessment session is in state "${session.status}" and cannot be modified.`,
        });
        return;
      }
    }

    req.assessmentSession = session;
    next();
  };
}
