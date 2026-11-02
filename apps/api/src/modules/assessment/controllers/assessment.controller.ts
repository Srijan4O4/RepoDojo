import type { Request, Response } from 'express';
import { AssessmentLifecycleService, LifecycleError } from '../services/assessment-lifecycle.service.js';
import { AssessmentModel } from '../models/assessment.model.js';

export class AssessmentController {
  /**
   * POST /api/assessments
   * Creates a new assessment session or returns existing active session/idempotent match.
   */
  public static async createSession(req: Request, res: Response): Promise<void> {
    const candidateId = req.user?.sub;
    if (!candidateId) {
      res.status(401).json({ error: 'UNAUTHORIZED' });
      return;
    }

    const { challengeId, challengeVersion, durationMinutes, idempotencyKey } = req.body;

    if (!challengeId) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Field "challengeId" is required.',
      });
      return;
    }

    try {
      const session = await AssessmentLifecycleService.createSession({
        candidateId,
        challengeId,
        challengeVersion,
        durationMinutes,
        idempotencyKey,
      });

      res.status(201).json({
        status: 'success',
        session: session.toSessionResponse(),
      });
    } catch (err: any) {
      if (err instanceof LifecycleError) {
        res.status(err.status).json({
          error: err.code,
          message: err.message,
          details: err.details,
        });
        return;
      }
      res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message });
    }
  }

  /**
   * GET /api/assessments/active
   * Retrieves the candidate's current active assessment session with countdown drift sync.
   */
  public static async getActiveSession(req: Request, res: Response): Promise<void> {
    const candidateId = req.user?.sub;
    if (!candidateId) {
      res.status(401).json({ error: 'UNAUTHORIZED' });
      return;
    }

    try {
      const activeData = await AssessmentLifecycleService.getActiveSession(candidateId);

      if (!activeData) {
        res.status(200).json({
          active: false,
          serverTime: new Date().toISOString(),
        });
        return;
      }

      res.status(200).json({
        active: true,
        ...activeData,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message });
    }
  }

  /**
   * GET /api/assessments/:id
   * Retrieves assessment session details.
   */
  public static async getSessionById(req: Request, res: Response): Promise<void> {
    const candidateId = req.user?.sub;
    const userRole = req.user?.role;
    const id = String(req.params.id);

    try {
      const session = await AssessmentModel.findById(id);

      if (!session) {
        res.status(404).json({ error: 'SESSION_NOT_FOUND', message: 'Assessment session not found.' });
        return;
      }

      // Check ownership unless admin
      if (session.candidateId.toString() !== candidateId && userRole !== 'admin') {
        res.status(403).json({ error: 'FORBIDDEN', message: 'Access denied.' });
        return;
      }

      res.status(200).json({
        status: 'success',
        session: session.toSessionResponse(),
      });
    } catch (err: any) {
      res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message });
    }
  }

  /**
   * POST /api/assessments/:id/start
   * Starts assessment and arms server-authoritative expiration timer.
   */
  public static async startSession(req: Request, res: Response): Promise<void> {
    const candidateId = req.user?.sub;
    const id = String(req.params.id);

    if (!candidateId) {
      res.status(401).json({ error: 'UNAUTHORIZED' });
      return;
    }

    try {
      const session = await AssessmentLifecycleService.startSession(id, candidateId);

      res.status(200).json({
        status: 'success',
        session: session.toSessionResponse(),
      });
    } catch (err: any) {
      if (err instanceof LifecycleError) {
        res.status(err.status).json({
          error: err.code,
          message: err.message,
          details: err.details,
        });
        return;
      }
      res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message });
    }
  }

  /**
   * POST /api/assessments/:id/heartbeat
   * Receives heartbeat, checks for expiration, returns drift-sync timing.
   */
  public static async heartbeat(req: Request, res: Response): Promise<void> {
    const candidateId = req.user?.sub;
    const id = String(req.params.id);

    if (!candidateId) {
      res.status(401).json({ error: 'UNAUTHORIZED' });
      return;
    }

    try {
      const heartbeat = await AssessmentLifecycleService.recordHeartbeat(id, candidateId);
      res.status(200).json(heartbeat);
    } catch (err: any) {
      if (err instanceof LifecycleError) {
        res.status(err.status).json({
          error: err.code,
          message: err.message,
        });
        return;
      }
      res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message });
    }
  }

  /**
   * POST /api/assessments/:id/submit
   * Submits candidate work, transitions to SUBMITTING -> QUEUED, and logs outbox job.
   */
  public static async submitSession(req: Request, res: Response): Promise<void> {
    const candidateId = req.user?.sub;
    const id = String(req.params.id);

    if (!candidateId) {
      res.status(401).json({ error: 'UNAUTHORIZED' });
      return;
    }

    try {
      const session = await AssessmentLifecycleService.submitSession(id, candidateId, req.body.metadata);

      res.status(200).json({
        status: 'success',
        message: 'Assessment submitted successfully and queued for evaluation.',
        session: session.toSessionResponse(),
      });
    } catch (err: any) {
      if (err instanceof LifecycleError) {
        res.status(err.status).json({
          error: err.code,
          message: err.message,
        });
        return;
      }
      res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message });
    }
  }
}
