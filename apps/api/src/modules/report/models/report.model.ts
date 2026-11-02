import mongoose, { Schema, Document } from 'mongoose';
import type { PerformanceReport } from '@repodojo/shared';

export interface ReportDocument
  extends Omit<PerformanceReport, 'id' | 'assessmentId' | 'evaluationId' | 'candidateId'>,
    Document {
  assessmentId: mongoose.Types.ObjectId;
  sessionId: mongoose.Types.ObjectId;
  evaluationId: mongoose.Types.ObjectId;
  candidateId: mongoose.Types.ObjectId;
}

const ReportSchema = new Schema<ReportDocument>(
  {
    assessmentId: { type: Schema.Types.ObjectId, ref: 'Assessment', required: true, index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'Assessment', required: true, index: true },
    evaluationId: { type: Schema.Types.ObjectId, ref: 'Evaluation', required: true },
    candidateId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    totalScore: { type: Number, required: true, min: 0, max: 100 },
    executiveSummary: { type: String, required: true },
    strengths: { type: [String], required: true, default: [] },
    areasForImprovement: { type: [String], required: true, default: [] },
    practiceRecommendations: { type: [String], required: true, default: [] },
    shareToken: { type: String, required: true, unique: true, index: true },
    generatedAt: { type: String, required: true, default: () => new Date().toISOString() },
  },
  {
    timestamps: true,
    collection: 'reports',
  }
);

export const ReportModel = mongoose.model<ReportDocument>('Report', ReportSchema);
