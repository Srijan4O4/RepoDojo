import mongoose, { Schema, Document } from 'mongoose';
import { SessionEvent, SessionEventType, LineCountBucket } from '@repodojo/shared';

export interface SessionEventDocument
  extends Omit<SessionEvent, 'id' | 'sessionId' | 'candidateId'>,
    Document {
  sessionId: mongoose.Types.ObjectId;
  candidateId: mongoose.Types.ObjectId;
}

const SessionEventSchema = new Schema<SessionEventDocument>(
  {
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: 'Assessment',
      required: true,
      index: true,
    },
    assessmentId: {
      type: String,
      required: true,
      index: true,
    },
    candidateId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    eventType: {
      type: String,
      required: true,
      enum: [
        'TAB_HIDDEN',
        'TAB_VISIBLE',
        'WINDOW_BLUR',
        'WINDOW_FOCUS',
        'PASTE_EVENT',
        'CODE_BURST',
        'TEST_EXECUTION',
        'AI_QUERY',
      ] as SessionEventType[],
    },
    timestamp: {
      type: String,
      required: true,
      default: () => new Date().toISOString(),
    },
    metadata: {
      durationMs: { type: Number },
      charCount: { type: Number },
      lineCountBucket: {
        type: String,
        enum: ['1-5', '6-15', '16-50', '50+'] as LineCountBucket[],
      },
      lineCount: { type: Number },
      targetFile: { type: String },
      triggerSource: { type: String },
      details: { type: Schema.Types.Mixed },
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, any>) => {
        ret.id = ret._id.toString();
        ret.sessionId = ret.sessionId.toString();
        ret.assessmentId = ret.assessmentId;
        ret.candidateId = ret.candidateId.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

// Compound indexes for high-throughput chronological retrieval and candidate audits
SessionEventSchema.index({ sessionId: 1, timestamp: 1 });
SessionEventSchema.index({ candidateId: 1, assessmentId: 1 });

export const SessionEventModel = mongoose.model<SessionEventDocument>(
  'SessionEvent',
  SessionEventSchema,
  'session_events',
);
