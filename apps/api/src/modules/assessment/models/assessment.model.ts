import mongoose, { Schema, Document, Model } from 'mongoose';
import type { AssessmentStatus, AssessmentSession } from '@repodojo/shared';

export interface IAssessment extends Document {
  candidateId: mongoose.Types.ObjectId;
  challengeId: string;
  challengeVersion: string;
  status: AssessmentStatus;
  startedAt?: Date;
  expiresAt?: Date;
  submittedAt?: Date;
  submissionHash?: string;
  durationMinutes: number;
  workspaceRevision: number;
  idempotencyKey?: string;
  lastHeartbeatAt?: Date;
  previewUrl?: string;
  containerId?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  toSessionResponse(): AssessmentSession;
}

const assessmentSchema = new Schema<IAssessment>(
  {
    candidateId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    challengeId: {
      type: String,
      required: true,
      trim: true,
    },
    challengeVersion: {
      type: String,
      required: true,
      default: 'v1.0.0',
      trim: true,
    },
    status: {
      type: String,
      enum: [
        'CREATED',
        'PROVISIONING',
        'READY',
        'IN_PROGRESS',
        'SUBMITTING',
        'QUEUED',
        'EVALUATING',
        'COMPLETED',
        'TIMED_OUT',
        'FAILED',
        'ABANDONED',
      ],
      default: 'CREATED',
      required: true,
    },
    startedAt: {
      type: Date,
    },
    expiresAt: {
      type: Date,
    },
    submittedAt: {
      type: Date,
    },
    submissionHash: {
      type: String,
    },
    durationMinutes: {
      type: Number,
      required: true,
      default: 60,
      min: 5,
      max: 180,
    },
    workspaceRevision: {
      type: Number,
      default: 0,
    },
    idempotencyKey: {
      type: String,
      trim: true,
    },
    lastHeartbeatAt: {
      type: Date,
    },
    previewUrl: {
      type: String,
    },
    containerId: {
      type: String,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Decision 4.3: Strict single active session per candidate partial unique index
assessmentSchema.index(
  { candidateId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ['CREATED', 'PROVISIONING', 'READY', 'IN_PROGRESS', 'SUBMITTING'] },
    },
    name: 'unique_active_candidate_session',
  }
);

// Sparse unique index for client idempotency keys
assessmentSchema.index(
  { candidateId: 1, idempotencyKey: 1 },
  {
    unique: true,
    sparse: true,
    name: 'unique_candidate_idempotency_key',
  }
);

// Index for server-side timer expiration sweeper (Decision 4.2)
assessmentSchema.index({ status: 1, expiresAt: 1 }, { name: 'status_expires_idx' });

assessmentSchema.methods.toSessionResponse = function (): AssessmentSession {
  return {
    id: this._id.toString(),
    candidateId: this.candidateId.toString(),
    challengeId: this.challengeId,
    challengeVersion: this.challengeVersion,
    status: this.status,
    startedAt: this.startedAt?.toISOString(),
    expiresAt: this.expiresAt?.toISOString(),
    submittedAt: this.submittedAt?.toISOString(),
    durationMinutes: this.durationMinutes,
    workspaceRevision: this.workspaceRevision,
    previewUrl: this.previewUrl,
    createdAt: this.createdAt.toISOString(),
    updatedAt: this.updatedAt.toISOString(),
  };
};

export const AssessmentModel: Model<IAssessment> =
  mongoose.models.Assessment || mongoose.model<IAssessment>('Assessment', assessmentSchema);
