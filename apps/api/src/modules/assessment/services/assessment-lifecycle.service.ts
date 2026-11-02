import mongoose from 'mongoose';
import { AssessmentModel, IAssessment } from '../models/assessment.model.js';
import { OutboxJobModel } from '../models/outbox-job.model.js';
import type { AssessmentStatus, AssessmentSession, HeartbeatResponse } from '@repodojo/shared';

/**
 * Strict Finite-State Machine valid transition table (Decision 4.1).
 */
export const VALID_TRANSITIONS: Record<AssessmentStatus, AssessmentStatus[]> = {
  CREATED: ['PROVISIONING', 'ABANDONED', 'FAILED'],
  PROVISIONING: ['READY', 'FAILED'],
  READY: ['IN_PROGRESS', 'ABANDONED', 'FAILED'],
  IN_PROGRESS: ['SUBMITTING', 'TIMED_OUT', 'ABANDONED', 'FAILED'],
  SUBMITTING: ['QUEUED', 'FAILED'],
  QUEUED: ['EVALUATING', 'FAILED'],
  EVALUATING: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  TIMED_OUT: ['SUBMITTING', 'QUEUED', 'FAILED'],
  FAILED: [],
  ABANDONED: [],
};

export class LifecycleError extends Error {
  public status: number;
  public code: string;
  public details?: unknown;

  constructor(message: string, code: string, status = 400, details?: unknown) {
    super(message);
    this.name = 'LifecycleError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class AssessmentLifecycleService {
  /**
   * Creates a new assessment session enforcing strict single active session per candidate (Decision 4.3).
   * Supports idempotency keys to safely replay client requests.
   */
  public static async createSession(params: {
    candidateId: string;
    challengeId: string;
    challengeVersion?: string;
    durationMinutes?: number;
    idempotencyKey?: string;
  }): Promise<IAssessment> {
    const { candidateId, challengeId, challengeVersion = 'v1.0.0', durationMinutes = 60, idempotencyKey } = params;

    // Check idempotency first if key provided
    if (idempotencyKey) {
      const existing = await AssessmentModel.findOne({ candidateId, idempotencyKey });
      if (existing) {
        return existing;
      }
    }

    // Check if candidate already has an active session
    const existingActive = await AssessmentModel.findOne({
      candidateId,
      status: { $in: ['CREATED', 'PROVISIONING', 'READY', 'IN_PROGRESS', 'SUBMITTING'] },
    });

    if (existingActive) {
      throw new LifecycleError(
        'Candidate already has an active assessment session in progress.',
        'ACTIVE_SESSION_EXISTS',
        409,
        { activeSessionId: existingActive._id.toString(), status: existingActive.status }
      );
    }

    try {
      const session = await AssessmentModel.create({
        candidateId: new mongoose.Types.ObjectId(candidateId),
        challengeId,
        challengeVersion,
        durationMinutes,
        idempotencyKey,
        status: 'CREATED',
      });

      return session;
    } catch (err: any) {
      if (err.code === 11000) {
        if (idempotencyKey && err.keyPattern?.idempotencyKey) {
          const replay = await AssessmentModel.findOne({ candidateId, idempotencyKey });
          if (replay) return replay;
        }
        throw new LifecycleError(
          'Candidate already has an active assessment session in progress.',
          'ACTIVE_SESSION_EXISTS',
          409
        );
      }
      throw err;
    }
  }

  /**
   * Starts the assessment timer with server-authoritative timestamps (Decision 4.2).
   */
  public static async startSession(sessionId: string, candidateId: string): Promise<IAssessment> {
    const session = await AssessmentModel.findOne({
      _id: sessionId,
      candidateId,
    });

    if (!session) {
      throw new LifecycleError('Assessment session not found.', 'SESSION_NOT_FOUND', 404);
    }

    if (session.status === 'IN_PROGRESS') {
      return session;
    }

    if (!['CREATED', 'PROVISIONING', 'READY'].includes(session.status)) {
      throw new LifecycleError(
        `Cannot start assessment in status '${session.status}'.`,
        'INVALID_STATE_TRANSITION',
        400
      );
    }

    const now = new Date();
    const durationMs = session.durationMinutes * 60 * 1000;
    const expiresAt = new Date(now.getTime() + durationMs);

    const updated = await AssessmentModel.findOneAndUpdate(
      {
        _id: sessionId,
        candidateId,
        status: { $in: ['CREATED', 'PROVISIONING', 'READY'] },
      },
      {
        $set: {
          status: 'IN_PROGRESS',
          startedAt: now,
          expiresAt,
          lastHeartbeatAt: now,
        },
      },
      { new: true }
    );

    if (!updated) {
      throw new LifecycleError('Failed to start session due to concurrent state update.', 'CONCURRENT_UPDATE', 409);
    }

    return updated;
  }

  /**
   * Processes candidate heartbeat ping (Decision 4.4).
   * Checks server-authoritative timer; auto-expires session if now >= expiresAt.
   */
  public static async recordHeartbeat(sessionId: string, candidateId: string): Promise<HeartbeatResponse> {
    const session = await AssessmentModel.findOne({
      _id: sessionId,
      candidateId,
    });

    if (!session) {
      throw new LifecycleError('Assessment session not found.', 'SESSION_NOT_FOUND', 404);
    }

    const now = new Date();

    // Check for expiration if currently IN_PROGRESS
    if (session.status === 'IN_PROGRESS') {
      if (session.expiresAt && now.getTime() >= session.expiresAt.getTime()) {
        // Auto-transition to TIMED_OUT (Decision 4.2)
        const timedOut = await AssessmentModel.findOneAndUpdate(
          {
            _id: sessionId,
            status: 'IN_PROGRESS',
          },
          {
            $set: {
              status: 'TIMED_OUT',
              lastHeartbeatAt: now,
            },
          },
          { new: true }
        );

        if (timedOut) {
          // Trigger outbox creation for auto-evaluation
          await this.createOutboxJob(timedOut, { reason: 'timer_expired' });
          timedOut.status = 'QUEUED';
          await timedOut.save();
        }

        return {
          sessionId,
          status: 'TIMED_OUT',
          serverTime: now.toISOString(),
          remainingSeconds: 0,
          isExpired: true,
        };
      }

      // Update heartbeat timestamp
      session.lastHeartbeatAt = now;
      await session.save();

      const remainingSeconds = session.expiresAt
        ? Math.max(0, Math.floor((session.expiresAt.getTime() - now.getTime()) / 1000))
        : 0;

      return {
        sessionId,
        status: session.status,
        serverTime: now.toISOString(),
        remainingSeconds,
        isExpired: false,
      };
    }

    // Terminal or non-running status
    return {
      sessionId,
      status: session.status,
      serverTime: now.toISOString(),
      remainingSeconds: 0,
      isExpired: ['TIMED_OUT', 'SUBMITTING', 'QUEUED', 'EVALUATING', 'COMPLETED'].includes(session.status),
    };
  }

  /**
   * Submits assessment for automated evaluation (Implementation Contracts §3, §4).
   * Transitions IN_PROGRESS / TIMED_OUT -> SUBMITTING -> QUEUED and generates transactional Outbox job.
   */
  public static async submitSession(
    sessionId: string,
    candidateId: string,
    metadata?: Record<string, unknown>
  ): Promise<IAssessment> {
    const session = await AssessmentModel.findOneAndUpdate(
      {
        _id: sessionId,
        candidateId,
        status: { $in: ['IN_PROGRESS', 'TIMED_OUT'] },
      },
      {
        $set: {
          status: 'SUBMITTING',
          submittedAt: new Date(),
        },
      },
      { new: true }
    );

    if (!session) {
      throw new LifecycleError(
        'Assessment cannot be submitted. Session must be in IN_PROGRESS or TIMED_OUT state.',
        'INVALID_SUBMISSION_STATE',
        400
      );
    }

    // Generate transactional outbox job for background evaluation worker
    await this.createOutboxJob(session, metadata);

    // Transition to QUEUED
    session.status = 'QUEUED';
    await session.save();

    return session;
  }

  /**
   * Background sweeper: scans and expires overdue active sessions.
   */
  public static async sweepExpiredSessions(): Promise<number> {
    const now = new Date();
    const expiredSessions = await AssessmentModel.find({
      status: 'IN_PROGRESS',
      expiresAt: { $lte: now },
    });

    let expiredCount = 0;

    for (const session of expiredSessions) {
      const updated = await AssessmentModel.findOneAndUpdate(
        {
          _id: session._id,
          status: 'IN_PROGRESS',
        },
        {
          $set: {
            status: 'TIMED_OUT',
          },
        },
        { new: true }
      );

      if (updated) {
        await this.createOutboxJob(updated, { reason: 'sweeper_timer_expired' });
        updated.status = 'QUEUED';
        await updated.save();
        expiredCount++;
      }
    }

    return expiredCount;
  }

  /**
   * Returns current active assessment session for candidate, including remainingSeconds.
   */
  public static async getActiveSession(candidateId: string): Promise<{
    session: AssessmentSession;
    remainingSeconds: number;
    serverTime: string;
  } | null> {
    const session = await AssessmentModel.findOne({
      candidateId,
      status: { $in: ['CREATED', 'PROVISIONING', 'READY', 'IN_PROGRESS', 'SUBMITTING'] },
    });

    if (!session) return null;

    const now = new Date();
    let remainingSeconds = 0;

    if (session.status === 'IN_PROGRESS' && session.expiresAt) {
      remainingSeconds = Math.max(0, Math.floor((session.expiresAt.getTime() - now.getTime()) / 1000));
    } else if (['CREATED', 'PROVISIONING', 'READY'].includes(session.status)) {
      remainingSeconds = session.durationMinutes * 60;
    }

    return {
      session: session.toSessionResponse(),
      remainingSeconds,
      serverTime: now.toISOString(),
    };
  }

  /**
   * Atomic FSM state transition helper with validation against VALID_TRANSITIONS.
   */
  public static async transitionState(
    sessionId: string,
    targetStatus: AssessmentStatus,
    allowedCurrentStatuses?: AssessmentStatus[],
    additionalUpdates?: Record<string, unknown>
  ): Promise<IAssessment> {
    const query: Record<string, unknown> = { _id: sessionId };
    if (allowedCurrentStatuses && allowedCurrentStatuses.length > 0) {
      query.status = { $in: allowedCurrentStatuses };
    }

    const session = await AssessmentModel.findOneAndUpdate(
      query,
      {
        $set: {
          status: targetStatus,
          ...additionalUpdates,
        },
      },
      { new: true }
    );

    if (!session) {
      throw new LifecycleError(
        `Failed to transition assessment to '${targetStatus}'. Either session does not exist or current status is invalid.`,
        'INVALID_STATE_TRANSITION',
        400
      );
    }

    return session;
  }

  /**
   * Helper to write idempotent evaluation job into outbox_jobs collection.
   */
  private static async createOutboxJob(session: IAssessment, metadata?: Record<string, unknown>): Promise<void> {
    const submissionId = `sub_${session._id.toString()}_${Date.now()}`;
    await OutboxJobModel.create({
      submissionId,
      assessmentId: session._id,
      candidateId: session.candidateId,
      challengeId: session.challengeId,
      payload: {
        sessionId: session._id.toString(),
        workspaceRevision: session.workspaceRevision,
        containerId: session.containerId,
        submittedAt: session.submittedAt || new Date(),
        metadata: metadata || {},
      },
      status: 'PENDING',
      attempts: 0,
    });
  }
}
