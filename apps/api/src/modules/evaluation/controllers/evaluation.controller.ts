import { Request, Response } from 'express';
import { EvaluationService } from '../services/evaluation.service.js';
import { AssessmentModel } from '../../assessment/models/assessment.model.js';

function getWorkerAuthSecret(): string {
  return (
    process.env.WORKER_AUTH_SECRET ||
    process.env.INTERNAL_SERVICE_KEY ||
    'dev-worker-auth-secret-repodojo-98765'
  );
}

export class EvaluationController {
  /**
   * POST /api/evaluations/session/:sessionId/submit
   * Candidate endpoint to freeze workspace and finalize evaluation.
   * Strips all candidate-supplied overrides to prevent score forgery (SEC-01).
   */
  public static async submitAndEvaluate(req: Request, res: Response): Promise<void> {
    const sessionId = String(req.params.sessionId);
    const candidateId = req.user?.sub || req.user?.id || req.user?._id;

    const session = await AssessmentModel.findById(sessionId);
    if (!session) {
      res.status(404).json({ error: 'SESSION_NOT_FOUND', message: 'Assessment session not found.' });
      return;
    }

    if (session.candidateId.toString() !== candidateId?.toString() && req.user?.role !== 'admin') {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Access denied.' });
      return;
    }

    try {
      // Intentionally do NOT pass req.body.overrides to prevent score tampering
      const evaluation = await EvaluationService.evaluateSession(sessionId);
      res.status(200).json({
        status: 'success',
        message: 'Assessment evaluated successfully.',
        evaluation,
      });
    } catch (err: any) {
      res.status(500).json({
        error: 'EVALUATION_FAILED',
        message: err.message || 'Evaluation processing failed.',
      });
    }
  }

  /**
   * POST /api/evaluations/internal/worker-result
   * Dedicated internal worker endpoint to ingest verified execution results (Decision 10.3).
   * Authenticated via worker shared secret independently of candidate JWTs.
   */
  public static async ingestWorkerResult(req: Request, res: Response): Promise<void> {
    const workerSecret =
      req.headers['x-repodojo-worker-auth'] ||
      req.headers['x-worker-secret'] ||
      req.headers['x-internal-service-key'];

    if (!workerSecret || workerSecret !== getWorkerAuthSecret()) {
      res.status(401).json({
        error: 'UNAUTHORIZED_WORKER',
        message: 'Invalid or missing worker authentication token.',
      });
      return;
    }

    const { sessionId, candidateId, submissionId, functionalReport } = req.body;
    if (!sessionId || !candidateId || !submissionId || !functionalReport) {
      res.status(400).json({
        error: 'INVALID_PAYLOAD',
        message: 'Fields "sessionId", "candidateId", "submissionId", and "functionalReport" are required.',
      });
      return;
    }

    try {
      const evaluation = await EvaluationService.ingestWorkerResult(req.body);
      res.status(200).json({
        status: 'success',
        message: 'Worker evaluation result ingested successfully.',
        evaluation,
      });
    } catch (err: any) {
      res.status(400).json({
        error: 'EVALUATION_INGEST_FAILED',
        message: err.message || 'Failed to ingest worker evaluation result.',
      });
    }
  }

  /**
   * GET /api/evaluations/session/:sessionId
   * Retrieves evaluated score and 3-pillar breakdown for candidate.
   */
  public static async getEvaluation(req: Request, res: Response): Promise<void> {
    const sessionId = String(req.params.sessionId);
    const candidateId = req.user?.sub || req.user?.id || req.user?._id;

    const session = await AssessmentModel.findById(sessionId);
    if (!session) {
      res.status(404).json({ error: 'SESSION_NOT_FOUND', message: 'Assessment session not found.' });
      return;
    }

    if (session.candidateId.toString() !== candidateId?.toString() && req.user?.role !== 'admin') {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Access denied.' });
      return;
    }

    const evaluation = await EvaluationService.getEvaluation(sessionId);
    if (!evaluation) {
      res.status(404).json({ error: 'EVALUATION_NOT_FOUND', message: 'Evaluation has not yet completed.' });
      return;
    }

    res.status(200).json({
      status: 'success',
      evaluation,
    });
  }
}
