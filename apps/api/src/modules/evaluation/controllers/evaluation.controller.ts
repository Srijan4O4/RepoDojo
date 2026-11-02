import { Request, Response } from 'express';
import { EvaluationService } from '../services/evaluation.service.js';
import { AssessmentModel } from '../../assessment/models/assessment.model.js';

export class EvaluationController {
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
      const evaluation = await EvaluationService.evaluateSession(sessionId, req.body?.overrides);
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
