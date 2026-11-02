import pino from 'pino';
import { OutboxJobModel, IOutboxJob } from '../models/outbox-job.model.js';
import { AssessmentModel } from '../models/assessment.model.js';
import { EvaluationService } from '../../evaluation/services/evaluation.service.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
});

export class OutboxDispatcherService {
  private static pollTimer: NodeJS.Timeout | null = null;
  private static isProcessing = false;

  /**
   * Processes a single pending outbox job idempotently.
   */
  public static async processJob(job: IOutboxJob): Promise<boolean> {
    const sessionId = job.assessmentId.toString();

    try {
      // 1. Transition session to EVALUATING state
      await AssessmentModel.findByIdAndUpdate(sessionId, {
        status: 'EVALUATING',
        updatedAt: new Date(),
      });

      // 2. Perform trusted evaluation
      await EvaluationService.evaluateSession(sessionId);

      // 3. Mark outbox job DISPATCHED
      job.status = 'DISPATCHED';
      job.lastAttemptAt = new Date();
      job.attempts = (job.attempts || 0) + 1;
      await job.save();

      logger.info(
        { sessionId, jobId: job._id },
        'Outbox job successfully dispatched and evaluated.',
      );
      return true;
    } catch (err: any) {
      job.attempts = (job.attempts || 0) + 1;
      job.lastAttemptAt = new Date();
      job.error = err.message || 'Evaluation dispatch failed';

      if (job.attempts >= 3) {
        job.status = 'FAILED';
        await AssessmentModel.findByIdAndUpdate(sessionId, {
          status: 'EVALUATION_FAILED',
          updatedAt: new Date(),
        });
      }

      await job.save();
      logger.error({ err, sessionId, jobId: job._id }, 'Failed to dispatch outbox evaluation job.');
      return false;
    }
  }

  /**
   * Scans and dispatches all currently pending outbox jobs in FIFO order.
   */
  public static async dispatchPendingJobs(limit = 10): Promise<number> {
    if (this.isProcessing) return 0;
    this.isProcessing = true;

    try {
      const pendingJobs = await OutboxJobModel.find({ status: 'PENDING' })
        .sort({ createdAt: 1 })
        .limit(limit);

      let processedCount = 0;
      for (const job of pendingJobs) {
        const success = await this.processJob(job);
        if (success) processedCount++;
      }

      return processedCount;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Starts periodic polling loop for the Outbox Dispatcher.
   */
  public static startPolling(intervalMs = 3000): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(async () => {
      try {
        await this.dispatchPendingJobs();
      } catch (err) {
        logger.error({ err }, 'Error in Outbox Dispatcher polling loop.');
      }
    }, intervalMs);
    this.pollTimer.unref();
  }

  /**
   * Stops periodic polling loop.
   */
  public static stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}
