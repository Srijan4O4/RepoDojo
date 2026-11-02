import mongoose, { Schema, Document, Model } from 'mongoose';
import type { AssistanceLevel } from '@repodojo/shared';

export interface IAIInteraction extends Document {
  sessionId: mongoose.Types.ObjectId;
  candidateId: mongoose.Types.ObjectId;
  challengeId: string;
  turnNumber: number;
  prompt: string;
  response: string;
  activeFile?: string;
  assistanceLevel: AssistanceLevel;
  tokensUsed: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  workspaceRevisionBefore: number;
  workspaceRevisionAfter: number;
  guardrailTriggered: boolean;
  guardrailReason?: string;
  latencyMs: number;
  createdAt: Date;
  updatedAt: Date;
}

const aiInteractionSchema = new Schema<IAIInteraction>(
  {
    sessionId: {
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
    turnNumber: {
      type: Number,
      required: true,
    },
    prompt: {
      type: String,
      required: true,
    },
    response: {
      type: String,
      required: true,
    },
    activeFile: {
      type: String,
    },
    assistanceLevel: {
      type: Number,
      enum: [1, 2, 3],
      default: 1,
    },
    tokensUsed: {
      inputTokens: { type: Number, default: 0 },
      outputTokens: { type: Number, default: 0 },
      totalTokens: { type: Number, default: 0 },
    },
    workspaceRevisionBefore: {
      type: Number,
      default: 0,
    },
    workspaceRevisionAfter: {
      type: Number,
      default: 0,
    },
    guardrailTriggered: {
      type: Boolean,
      default: false,
    },
    guardrailReason: {
      type: String,
    },
    latencyMs: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for session history & auditing (Decision 8.4)
aiInteractionSchema.index({ sessionId: 1, turnNumber: 1 });

export const AIInteractionModel: Model<IAIInteraction> =
  mongoose.models.AIInteraction || mongoose.model<IAIInteraction>('AIInteraction', aiInteractionSchema);
