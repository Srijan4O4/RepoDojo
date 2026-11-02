import mongoose, { Schema, Document } from 'mongoose';
import type { EvaluationResult } from '@repodojo/shared';

export interface EvaluationDocument
  extends Omit<EvaluationResult, 'id' | 'sessionId' | 'assessmentId' | 'candidateId'>,
    Document {
  sessionId: mongoose.Types.ObjectId;
  assessmentId: mongoose.Types.ObjectId;
  candidateId: mongoose.Types.ObjectId;
  challengeId: string;
  executionTimeMs: number;
}

const DefectBreakdownSchema = new Schema(
  {
    passed: { type: Boolean, required: true },
    assertionsPassed: { type: Number, required: true },
    totalAssertions: { type: Number, required: true },
    score: { type: Number, required: true },
  },
  { _id: false }
);

const FunctionalPillarSchema = new Schema(
  {
    score: { type: Number, required: true, min: 0, max: 60 },
    defectsResolvedCount: { type: Number, required: true, min: 0, max: 8 },
    defectsBreakdown: { type: Schema.Types.Mixed, default: {} },
    baselineRegressionsPassed: { type: Boolean, required: true },
    baselineRegressionScore: { type: Number, required: true, min: 0, max: 12 },
  },
  { _id: false }
);

const CodeQualityPillarSchema = new Schema(
  {
    score: { type: Number, required: true, min: 0, max: 20 },
    staticAnalysisScore: { type: Number, required: true, min: 0, max: 8 },
    maintainabilityScore: { type: Number, required: true, min: 0, max: 8 },
    architectureComplianceScore: { type: Number, required: true, min: 0, max: 4 },
    lintErrorsCount: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

const TrajectoryPillarSchema = new Schema(
  {
    score: { type: Number, required: true, min: 0, max: 20 },
    verificationDisciplineScore: { type: Number, required: true, min: 0, max: 8 },
    aiAssistanceEfficiencyScore: { type: Number, required: true, min: 0, max: 6 },
    iterativeDebuggingScore: { type: Number, required: true, min: 0, max: 6 },
    testsRunCount: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

const EvaluationSchema = new Schema<EvaluationDocument>(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: 'Assessment', required: true, index: true },
    assessmentId: { type: Schema.Types.ObjectId, ref: 'Assessment', required: true },
    candidateId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    challengeId: { type: String, required: true },
    challengeVersion: { type: String, required: true, default: '1.0.0' },
    submissionHash: { type: String, required: true },
    totalScore: { type: Number, required: true, min: 0, max: 100 },
    pillars: {
      functionalCorrectness: { type: FunctionalPillarSchema, required: true },
      codeQuality: { type: CodeQualityPillarSchema, required: true },
      engineeringTrajectory: { type: TrajectoryPillarSchema, required: true },
    },
    executionTimeMs: { type: Number, default: 0 },
    evaluatedAt: { type: String, required: true, default: () => new Date().toISOString() },
  },
  {
    timestamps: true,
    collection: 'evaluations',
  }
);

// Compound index for fast lookup of candidate's latest evaluation
EvaluationSchema.index({ candidateId: 1, createdAt: -1 });

export const EvaluationModel = mongoose.model<EvaluationDocument>('Evaluation', EvaluationSchema);
