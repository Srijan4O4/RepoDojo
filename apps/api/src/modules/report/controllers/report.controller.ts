import { Request, Response } from 'express';
import { ReportService } from '../services/report.service.js';
import { AssessmentModel } from '../../assessment/models/assessment.model.js';

export class ReportController {
  public static async generateReport(req: Request, res: Response): Promise<void> {
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
      const report = await ReportService.generateOrGetReport(sessionId);
      res.status(200).json({
        status: 'success',
        report,
      });
    } catch (err: any) {
      res.status(500).json({
        error: 'REPORT_GENERATION_FAILED',
        message: err.message || 'Report generation failed.',
      });
    }
  }

  public static async getReport(req: Request, res: Response): Promise<void> {
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

    const report = await ReportService.getReportBySessionId(sessionId);
    if (!report) {
      res.status(404).json({ error: 'REPORT_NOT_FOUND', message: 'Report has not yet been generated.' });
      return;
    }

    res.status(200).json({
      status: 'success',
      report,
    });
  }

  public static async getSharedReport(req: Request, res: Response): Promise<void> {
    const shareToken = String(req.params.shareToken);
    const publicReport = await ReportService.getReportByShareToken(shareToken);

    if (!publicReport) {
      res.status(404).json({ error: 'REPORT_NOT_FOUND', message: 'Shared report not found or link has expired.' });
      return;
    }

    res.status(200).json({
      status: 'success',
      report: publicReport,
    });
  }
}
