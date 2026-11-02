import mongoose from 'mongoose';
import {
  SessionEvent,
  SessionEventType,
  LineCountBucket,
  IntegritySummary,
  IntegrityAnomaly,
  SessionEventMetadata,
} from '@repodojo/shared';
import { SessionEventModel, SessionEventDocument } from '../models/session-event.model.js';
import { AssessmentModel } from '../../assessment/models/assessment.model.js';

export function determineLineBucket(lineCount?: number): LineCountBucket {
  if (!lineCount || lineCount <= 5) return '1-5';
  if (lineCount <= 15) return '6-15';
  if (lineCount <= 50) return '16-50';
  return '50+';
}

export function sanitizeMetadata(metadata?: SessionEventMetadata): SessionEventMetadata | undefined {
  if (!metadata) return undefined;

  const sanitized: SessionEventMetadata = {
    durationMs: metadata.durationMs,
    charCount: metadata.charCount,
    lineCount: metadata.lineCount,
    lineCountBucket: metadata.lineCountBucket || determineLineBucket(metadata.lineCount),
    targetFile: metadata.targetFile,
    triggerSource: metadata.triggerSource,
  };

  // Strictly sanitize details to ensure zero raw clipboard text is captured (PRD §15.1 Privacy Mandate)
  if (metadata.details && typeof metadata.details === 'object') {
    const detailsCopy = { ...metadata.details };
    delete (detailsCopy as Record<string, unknown>).text;
    delete (detailsCopy as Record<string, unknown>).content;
    delete (detailsCopy as Record<string, unknown>).clipboard;
    delete (detailsCopy as Record<string, unknown>).raw;
    sanitized.details = detailsCopy;
  }

  return sanitized;
}

export class IntegrityService {
  /**
   * Ingests a single candidate telemetry event with session verification.
   */
  public static async recordEvent(
    candidateId: string,
    eventData: {
      sessionId: string;
      assessmentId: string;
      eventType: SessionEventType;
      timestamp?: string;
      metadata?: SessionEventMetadata;
    },
  ): Promise<SessionEventDocument> {
    const session = await AssessmentModel.findById(eventData.sessionId);
    if (!session) {
      throw new Error('Assessment session not found');
    }

    if (session.candidateId.toString() !== candidateId) {
      throw new Error('Unauthorized: Session does not belong to candidate');
    }

    // Allow events during active or submitting lifecycle states
    if (session.status !== 'IN_PROGRESS' && session.status !== 'SUBMITTING' && session.status !== 'READY') {
      throw new Error(`Cannot ingest telemetry for session in ${session.status} state`);
    }

    const event = new SessionEventModel({
      sessionId: new mongoose.Types.ObjectId(eventData.sessionId),
      assessmentId: eventData.assessmentId,
      candidateId: new mongoose.Types.ObjectId(candidateId),
      eventType: eventData.eventType,
      timestamp: eventData.timestamp || new Date().toISOString(),
      metadata: sanitizeMetadata(eventData.metadata),
    });

    return await event.save();
  }

  /**
   * Ingests a batch of telemetry events.
   * Validates that all events in batch belong strictly to the candidate's authorized active session (SEC-06).
   */
  public static async recordBatch(
    candidateId: string,
    events: Array<{
      sessionId: string;
      assessmentId: string;
      eventType: SessionEventType;
      timestamp?: string;
      metadata?: SessionEventMetadata;
    }>,
  ): Promise<number> {
    if (!events.length) return 0;
    if (events.length > 50) {
      throw new Error('Batch size exceeds maximum limit of 50 events');
    }

    const targetSessionId = events[0].sessionId;

    // SEC-06: Reject cross-session telemetry batch injection attempts
    for (const ev of events) {
      if (ev.sessionId !== targetSessionId) {
        throw new Error('Cross-session telemetry injection detected: All events in batch must belong to the same session');
      }
    }

    const session = await AssessmentModel.findById(targetSessionId);
    if (!session) {
      throw new Error('Assessment session not found');
    }

    if (session.candidateId.toString() !== candidateId) {
      throw new Error('Unauthorized: Session does not belong to candidate');
    }

    // Lifecycle state verification: only allow telemetry during active or submitting states
    if (session.status !== 'IN_PROGRESS' && session.status !== 'SUBMITTING' && session.status !== 'READY') {
      throw new Error(`Cannot ingest telemetry for session in ${session.status} state`);
    }

    const docs = events.map((ev) => ({
      sessionId: session._id,
      assessmentId: ev.assessmentId,
      candidateId: new mongoose.Types.ObjectId(candidateId),
      eventType: ev.eventType,
      timestamp: ev.timestamp || new Date().toISOString(),
      metadata: sanitizeMetadata(ev.metadata),
    }));

    const result = await SessionEventModel.insertMany(docs);
    return result.length;
  }

  /**
   * Retrieves chronological event stream for a session.
   */
  public static async getTimeline(sessionId: string): Promise<SessionEventDocument[]> {
    return await SessionEventModel.find({
      sessionId: new mongoose.Types.ObjectId(sessionId),
    })
      .sort({ timestamp: 1 })
      .exec();
  }

  /**
   * Computes an advisory integrity analysis and anomaly summary for an assessment session.
   * Note: Purely advisory for human reviewer context; zero automated disqualifications (ADR 15.1).
   */
  public static async computeIntegritySummary(sessionId: string): Promise<IntegritySummary> {
    const session = await AssessmentModel.findById(sessionId);
    if (!session) {
      throw new Error('Assessment session not found');
    }

    const events = await SessionEventModel.find({
      sessionId: new mongoose.Types.ObjectId(sessionId),
    })
      .sort({ timestamp: 1 })
      .lean();

    let totalTabHiddenDurationMs = 0;
    let tabSwitchCount = 0;
    let bulkPasteCount = 0;
    let totalCharsPasted = 0;

    const anomalies: IntegrityAnomaly[] = [];

    // Track tab visibility pairings and durations
    for (const ev of events) {
      if (ev.eventType === 'TAB_HIDDEN') {
        tabSwitchCount++;
      }

      if (ev.eventType === 'TAB_VISIBLE') {
        const duration = ev.metadata?.durationMs || 0;
        totalTabHiddenDurationMs += duration;

        // Anomaly: Prolonged tab inactivity (>3 minutes)
        if (duration > 600000) {
          // > 10 minutes
          anomalies.push({
            type: 'PROLONGED_TAB_INACTIVITY',
            severity: 'high',
            description: `Prolonged tab inactivity detected (${Math.round(duration / 60000)} minutes away)`,
            timestamp: ev.timestamp,
            metadata: { durationMs: duration },
          });
        } else if (duration > 180000) {
          // > 3 minutes
          anomalies.push({
            type: 'PROLONGED_TAB_INACTIVITY',
            severity: 'medium',
            description: `Extended tab inactivity detected (${Math.round(duration / 1000)}s away)`,
            timestamp: ev.timestamp,
            metadata: { durationMs: duration },
          });
        }
      }

      if (ev.eventType === 'PASTE_EVENT') {
        const charCount = ev.metadata?.charCount || 0;
        const lineCount = ev.metadata?.lineCount || 0;
        const bucket = ev.metadata?.lineCountBucket;

        totalCharsPasted += charCount;

        if (bucket === '16-50' || bucket === '50+' || lineCount > 15 || charCount > 500) {
          bulkPasteCount++;
        }

        // Anomaly: Massive bulk paste (>50 lines or >1500 chars)
        if (bucket === '50+' || lineCount > 50 || charCount > 1500) {
          anomalies.push({
            type: 'RAPID_BULK_PASTE',
            severity: 'high',
            description: `Substantial bulk insertion detected (${lineCount || '>50'} lines, ${charCount} chars) in ${ev.metadata?.targetFile || 'editor'}`,
            timestamp: ev.timestamp,
            metadata: { lineCount, charCount, targetFile: ev.metadata?.targetFile },
          });
        } else if (bucket === '16-50' || lineCount > 20 || charCount > 800) {
          anomalies.push({
            type: 'RAPID_BULK_PASTE',
            severity: 'medium',
            description: `Moderate bulk insertion detected (${lineCount} lines, ${charCount} chars) in ${ev.metadata?.targetFile || 'editor'}`,
            timestamp: ev.timestamp,
            metadata: { lineCount, charCount, targetFile: ev.metadata?.targetFile },
          });
        }
      }
    }

    // Anomaly: Frequent context switching (>15 tab switches during session)
    if (tabSwitchCount > 25) {
      anomalies.push({
        type: 'FREQUENT_CONTEXT_SWITCHING',
        severity: 'high',
        description: `Very high context switching frequency: ${tabSwitchCount} tab transitions during assessment`,
        timestamp: new Date().toISOString(),
        metadata: { tabSwitchCount },
      });
    } else if (tabSwitchCount > 15) {
      anomalies.push({
        type: 'FREQUENT_CONTEXT_SWITCHING',
        severity: 'medium',
        description: `Elevated context switching frequency: ${tabSwitchCount} tab transitions during assessment`,
        timestamp: new Date().toISOString(),
        metadata: { tabSwitchCount },
      });
    }

    // Calculate advisory Integrity Score (0-100 baseline)
    let integrityScore = 100;
    for (const anomaly of anomalies) {
      if (anomaly.severity === 'high') {
        integrityScore -= 20;
      } else if (anomaly.severity === 'medium') {
        integrityScore -= 10;
      } else {
        integrityScore -= 5;
      }
    }
    integrityScore = Math.max(0, Math.min(100, integrityScore));

    return {
      sessionId,
      assessmentId: session.challengeId || session._id.toString(),
      candidateId: session.candidateId.toString(),
      totalTabHiddenDurationMs,
      tabSwitchCount,
      bulkPasteCount,
      totalCharsPasted,
      anomalies,
      integrityScore,
      evaluatedAt: new Date().toISOString(),
    };
  }
}
