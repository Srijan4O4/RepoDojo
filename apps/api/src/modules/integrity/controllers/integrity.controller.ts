import { Request, Response } from 'express';
import { IntegrityService } from '../services/integrity.service.js';
import { AssessmentModel } from '../../assessment/models/assessment.model.js';

export class IntegrityController {
  /**
   * Ingest telemetry event(s) from candidate client.
   * Supports both single event and batch array in req.body.
   */
  public static async ingestEvents(req: Request, res: Response): Promise<void> {
    try {
      const candidateId = (req.user as any)?.sub || (req.user as any)?.id || (req.user as any)?._id;
      if (!candidateId) {
        res.status(401).json({ status: 'error', message: 'Authentication required' });
        return;
      }

      if (Array.isArray(req.body.events)) {
        const count = await IntegrityService.recordBatch(candidateId, req.body.events);
        res.status(201).json({ status: 'success', message: `Ingested ${count} telemetry events` });
        return;
      }

      const { sessionId, assessmentId, eventType, timestamp, metadata } = req.body;
      if (!sessionId || !assessmentId || !eventType) {
        res.status(400).json({
          status: 'error',
          message: 'Missing required event fields: sessionId, assessmentId, eventType',
        });
        return;
      }

      const saved = await IntegrityService.recordEvent(candidateId, {
        sessionId,
        assessmentId,
        eventType,
        timestamp,
        metadata,
      });

      res.status(201).json({ status: 'success', event: saved });
    } catch (err: any) {
      if (err.message.includes('not found')) {
        res.status(404).json({ status: 'error', message: err.message });
        return;
      }
      if (err.message.includes('Unauthorized') || err.message.includes('state')) {
        res.status(403).json({ status: 'error', message: err.message });
        return;
      }
      res.status(500).json({ status: 'error', message: err.message || 'Internal server error' });
    }
  }

  /**
   * Get activity timeline for an assessment session.
   */
  public static async getTimeline(req: Request, res: Response): Promise<void> {
    try {
      const candidateId = (req.user as any)?.sub || (req.user as any)?.id || (req.user as any)?._id;
      const role = (req.user as any)?.role;
      const sessionId = req.params.sessionId as string;

      const session = await AssessmentModel.findById(sessionId);
      if (!session) {
        res.status(404).json({ status: 'error', message: 'Assessment session not found' });
        return;
      }

      // Allow candidate owner or admin
      if (session.candidateId.toString() !== candidateId && role !== 'admin') {
        res.status(403).json({ status: 'error', message: 'Forbidden: Access to session denied' });
        return;
      }

      const timeline = await IntegrityService.getTimeline(sessionId);
      res.status(200).json({ status: 'success', timeline });
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message || 'Internal server error' });
    }
  }

  /**
   * Get advisory integrity summary for an assessment session.
   */
  public static async getSummary(req: Request, res: Response): Promise<void> {
    try {
      const candidateId = (req.user as any)?.sub || (req.user as any)?.id || (req.user as any)?._id;
      const role = (req.user as any)?.role;
      const sessionId = req.params.sessionId as string;

      const session = await AssessmentModel.findById(sessionId);
      if (!session) {
        res.status(404).json({ status: 'error', message: 'Assessment session not found' });
        return;
      }

      if (session.candidateId.toString() !== candidateId && role !== 'admin') {
        res.status(403).json({ status: 'error', message: 'Forbidden: Access to session denied' });
        return;
      }

      const summary = await IntegrityService.computeIntegritySummary(sessionId);
      res.status(200).json({ status: 'success', summary });
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message || 'Internal server error' });
    }
  }
}
