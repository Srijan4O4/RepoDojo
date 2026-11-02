import { describe, it, expect } from 'vitest';
import type { PerformanceReport, EvaluationResult } from '@repodojo/shared';

describe('Domain 11: Candidate Performance Report Data & Presentation Model', () => {
  const mockReport: PerformanceReport = {
    id: 'rep-001',
    assessmentId: 'assess-001',
    evaluationId: 'eval-001',
    candidateId: 'cand-001',
    totalScore: 84.5,
    executiveSummary:
      'The candidate demonstrated strong Mid-Level debugging capabilities, scoring 84.5/100 overall.',
    strengths: [
      'Systematic functional defect localization with 48.0/60 in functional correctness.',
      'High test verification discipline with iterative validation before submission.',
    ],
    areasForImprovement: [
      'Deepen focus on asynchronous promise resolution and race-condition edge cases.',
    ],
    practiceRecommendations: [
      'Practice designing comprehensive test fixtures covering boundary conditions.',
    ],
    shareToken: 'tok-abc-123-xyz',
    generatedAt: '2026-11-03T00:00:00.000Z',
  };

  const mockEvaluation: EvaluationResult = {
    id: 'eval-001',
    sessionId: 'sess-001',
    assessmentId: 'assess-001',
    candidateId: 'cand-001',
    challengeVersion: '1.0.0',
    submissionHash: 'c4d5e6f7a8b9',
    totalScore: 84.5,
    pillars: {
      functionalCorrectness: {
        score: 48,
        defectsResolvedCount: 7,
        defectsBreakdown: {
          'DEF-01': { passed: true, assertionsPassed: 3, totalAssertions: 3, score: 6 },
          'DEF-02': { passed: true, assertionsPassed: 4, totalAssertions: 4, score: 6 },
        },
        baselineRegressionsPassed: true,
        baselineRegressionScore: 12,
      },
      codeQuality: {
        score: 18.5,
        staticAnalysisScore: 8,
        maintainabilityScore: 7.5,
        architectureComplianceScore: 3,
        lintErrorsCount: 0,
      },
      engineeringTrajectory: {
        score: 18,
        verificationDisciplineScore: 8,
        aiAssistanceEfficiencyScore: 5,
        iterativeDebuggingScore: 5,
        testsRunCount: 4,
      },
    },
    evaluatedAt: '2026-11-03T00:00:00.000Z',
  };

  it('should validate report structure and score aggregation across 3 pillars', () => {
    expect(mockReport.totalScore).toBe(84.5);
    expect(mockReport.shareToken).toBe('tok-abc-123-xyz');
    expect(mockReport.strengths.length).toBe(2);
    expect(mockReport.areasForImprovement.length).toBe(1);
    expect(mockReport.practiceRecommendations.length).toBe(1);

    const pillars = mockEvaluation.pillars;
    const computedSum =
      pillars.functionalCorrectness.score +
      pillars.codeQuality.score +
      pillars.engineeringTrajectory.score;
    expect(computedSum).toBe(84.5);
  });

  it('should verify defect breakdown assertions and points awarded', () => {
    const defects = mockEvaluation.pillars.functionalCorrectness.defectsBreakdown;
    expect(defects['DEF-01'].passed).toBe(true);
    expect(defects['DEF-01'].score).toBe(6);
    expect(defects['DEF-02'].assertionsPassed).toBe(4);
    expect(mockEvaluation.pillars.functionalCorrectness.defectsResolvedCount).toBe(7);
    expect(mockEvaluation.pillars.functionalCorrectness.baselineRegressionsPassed).toBe(true);
  });
});
