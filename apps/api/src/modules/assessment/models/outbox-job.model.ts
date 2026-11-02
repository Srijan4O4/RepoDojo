import mongoose, { Schema, Document, Model } from 'mongoose';
import type { OutboxJobStatus } from '@repodojo/shared';

export interface IOutboxJob extends Document {
  submissionId: string;
  assessmentId: mongoose.Types.ObjectId;
  candidateId: mongoose.Types.ObjectId;
  challengeId: string;
  payload: Record<string, unknown>;
  status: OutboxJobStatus;
  attempts: number;
  lastAttemptAt?: Date;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const outboxJobSchema = new Schema<IOutboxJob>(
  {
    submissionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    assessmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Assessment',
      required: true,
      index: true,
    },
    candidateId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    challengeId: {
      type: String,
      required: true,
    },
    payload: {
      type: Schema.Types.Mixed,
      required: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'DISPATCHED', 'FAILED'],
      default: 'PENDING',
      required: true,
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    lastAttemptAt: {
      type: Date,
    },
    error: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for outbox polling
outboxJobSchema.index({ status: 1, createdAt: 1 });

export const OutboxJobModel: Model<IOutboxJob> =
  mongoose.models.OutboxJob || mongoose.model<IOutboxJob>('OutboxJob', outboxJobSchema);
