import crypto from 'crypto';
import type { EvaluationResult } from '@repodojo/shared';

export interface DefectExecutionInput {
  defectId: string;
  assertionsPassed: number;
  totalAssertions: number;
  prerequisitesMet?: boolean;
}

export interface FunctionalTestReport {
  defects: DefectExecutionInput[];
  baselinePassed: number;
  baselineTotal: number;
}

export interface StaticAnalysisReport {
  lintErrors: number;
  typeErrors: number;
  maxFunctionComplexity: number;
  preservedPublicContracts: boolean;
}

export interface TrajectoryTelemetryInput {
  testsRunCount: number;
  revisionsCount: number;
  totalTokensUsed: number;
  guardrailsTriggeredCount: number;
  aiTurnsCount: number;
}

export interface ScoringEngineInput {
  sessionId: string;
  assessmentId: string;
  candidateId: string;
  challengeId: string;
  challengeVersion?: string;
  submissionFiles?: Record<string, string>;
  functionalReport: FunctionalTestReport;
  staticAnalysisReport?: StaticAnalysisReport;
  trajectoryInput?: TrajectoryTelemetryInput;
}

export class ScoringEngineService {
  /**
   * Validates scoring engine inputs against strict schema and integrity rules (PRD §10).
   */
  public static validateInput(input: ScoringEngineInput): void {
    if (!input) {
      throw new Error('Scoring engine input is required.');
    }
    if (!input.sessionId || !input.candidateId) {
      throw new Error('Session ID and Candidate ID are required for scoring.');
    }
    if (!input.functionalReport) {
      throw new Error('Functional report is required for evaluation.');
    }

    const { functionalReport, staticAnalysisReport, trajectoryInput } = input;

    // Validate Baseline regressions
    if (
      !Number.isInteger(functionalReport.baselinePassed) ||
      functionalReport.baselinePassed < 0 ||
      !Number.isInteger(functionalReport.baselineTotal) ||
      functionalReport.baselineTotal < 0
    ) {
      throw new Error('Baseline test counts must be non-negative integers.');
    }
    if (functionalReport.baselinePassed > functionalReport.baselineTotal) {
      throw new Error('Baseline passed assertions cannot exceed total baseline assertions.');
    }

    // Validate Defects
    const defectIds = new Set<string>();
    for (const d of functionalReport.defects || []) {
      if (!d.defectId || typeof d.defectId !== 'string') {
        throw new Error('Each defect in functional report must have a valid defectId.');
      }
      if (defectIds.has(d.defectId)) {
        throw new Error(`Duplicate defect ID "${d.defectId}" detected in functional report.`);
      }
      defectIds.add(d.defectId);

      if (
        !Number.isInteger(d.assertionsPassed) ||
        d.assertionsPassed < 0 ||
        !Number.isInteger(d.totalAssertions) ||
        d.totalAssertions < 0
      ) {
        throw new Error(`Assertion counts for defect "${d.defectId}" must be non-negative integers.`);
      }
      if (d.assertionsPassed > d.totalAssertions) {
        throw new Error(
          `Assertions passed (${d.assertionsPassed}) cannot exceed total assertions (${d.totalAssertions}) for defect "${d.defectId}".`
        );
      }
    }

    // Validate Static Analysis if provided
    if (staticAnalysisReport) {
      if (
        !Number.isInteger(staticAnalysisReport.lintErrors) ||
        staticAnalysisReport.lintErrors < 0 ||
        !Number.isInteger(staticAnalysisReport.typeErrors) ||
        staticAnalysisReport.typeErrors < 0 ||
        !Number.isInteger(staticAnalysisReport.maxFunctionComplexity) ||
        staticAnalysisReport.maxFunctionComplexity < 0
      ) {
        throw new Error('Static analysis counts must be non-negative integers.');
      }
    }

    // Validate Trajectory Input if provided
    if (trajectoryInput) {
      if (
        trajectoryInput.testsRunCount < 0 ||
        trajectoryInput.revisionsCount < 0 ||
        trajectoryInput.totalTokensUsed < 0 ||
        trajectoryInput.guardrailsTriggeredCount < 0 ||
        trajectoryInput.aiTurnsCount < 0
      ) {
        throw new Error('Trajectory telemetry counts cannot be negative.');
      }
    }
  }

  /**
   * Deterministically calculates the 3-pillar evaluation score (0-100)
   * in strict compliance with ADR-001 Decision 10.2.
   */
  public static calculateEvaluation(input: ScoringEngineInput): Omit<EvaluationResult, 'id'> {
    this.validateInput(input);

    const {
      sessionId,
      assessmentId,
      candidateId,
      challengeId,
      challengeVersion = '1.0.0',
      submissionFiles = {},
      functionalReport,
      staticAnalysisReport = {
        lintErrors: 0,
        typeErrors: 0,
        maxFunctionComplexity: 5,
        preservedPublicContracts: true,
      },
      trajectoryInput = {
        testsRunCount: 1,
        revisionsCount: 1,
        totalTokensUsed: 0,
        guardrailsTriggeredCount: 0,
        aiTurnsCount: 0,
      },
    } = input;

    // 1. Pillar 1: Functional Correctness (0 - 60 Points)
    const defectsBreakdown: Record<
      string,
      { passed: boolean; assertionsPassed: number; totalAssertions: number; score: number }
    > = {};

    let defectsTotalScore = 0;
    let defectsResolvedCount = 0;

    for (const d of functionalReport.defects) {
      const isPrereqMet = d.prerequisitesMet ?? true;
      const ratio = d.totalAssertions > 0 ? d.assertionsPassed / d.totalAssertions : 0;
      const isFullyPassed = ratio >= 1.0 && isPrereqMet;

      // Max 6 pts per defect (Decision 10.2: 8 defects * 6 pts = 48 pts)
      const defectScore = isPrereqMet ? Math.round(ratio * 6 * 100) / 100 : 0;

      defectsBreakdown[d.defectId] = {
        passed: isFullyPassed,
        assertionsPassed: d.assertionsPassed,
        totalAssertions: d.totalAssertions,
        score: defectScore,
      };

      defectsTotalScore += defectScore;
      if (isFullyPassed) {
        defectsResolvedCount++;
      }
    }

    // Baseline Regression Preservation (12 Points)
    const baselineRatio =
      functionalReport.baselineTotal > 0
        ? functionalReport.baselinePassed / functionalReport.baselineTotal
        : 1.0;
    const baselineRegressionsPassed = baselineRatio >= 1.0;
    const baselineRegressionScore = Math.round(baselineRatio * 12 * 100) / 100;

    const functionalScore = Math.min(
      60,
      Math.max(0, Math.round((defectsTotalScore + baselineRegressionScore) * 10) / 10)
    );

    // 2. Pillar 2: Code Quality and Architecture (0 - 20 Points)
    // 2a. Static Analysis & Type Safety (0 - 8 pts)
    let staticAnalysisScore = 8;
    if (staticAnalysisReport.typeErrors > 0) {
      staticAnalysisScore -= Math.min(4, staticAnalysisReport.typeErrors * 2);
    }
    if (staticAnalysisReport.lintErrors > 0) {
      if (staticAnalysisReport.lintErrors <= 2) staticAnalysisScore -= 1;
      else if (staticAnalysisReport.lintErrors <= 5) staticAnalysisScore -= 3;
      else staticAnalysisScore -= 5;
    }
    staticAnalysisScore = Math.max(0, Math.min(8, staticAnalysisScore));

    // 2b. Implementation Maintainability (0 - 8 pts)
    let maintainabilityScore = 8;
    if (staticAnalysisReport.maxFunctionComplexity > 15) {
      maintainabilityScore -= 4;
    } else if (staticAnalysisReport.maxFunctionComplexity > 10) {
      maintainabilityScore -= 2;
    }
    maintainabilityScore = Math.max(0, Math.min(8, maintainabilityScore));

    // 2c. Architecture & Contract Compliance (0 - 4 pts)
    const architectureComplianceScore = staticAnalysisReport.preservedPublicContracts ? 4 : 1;

    const codeQualityScore = Math.min(
      20,
      Math.max(
        0,
        Math.round((staticAnalysisScore + maintainabilityScore + architectureComplianceScore) * 10) / 10
      )
    );

    // 3. Pillar 3: Engineering Trajectory & Responsible AI Usage (0 - 20 Points)
    // 3a. Verification Discipline (0 - 8 pts)
    let verificationDisciplineScore = 2;
    if (trajectoryInput.testsRunCount >= 4) {
      verificationDisciplineScore = 8;
    } else if (trajectoryInput.testsRunCount >= 2) {
      verificationDisciplineScore = 6;
    } else if (trajectoryInput.testsRunCount === 1) {
      verificationDisciplineScore = 4;
    }

    // 3b. AI Assistance Efficiency (0 - 6 pts)
    // Candidates who solve problems independently without AI receive full score (Decision 10.2)
    let aiAssistanceEfficiencyScore = 6;
    if (trajectoryInput.totalTokensUsed > 40000) {
      aiAssistanceEfficiencyScore = 3;
    } else if (trajectoryInput.totalTokensUsed > 25000) {
      aiAssistanceEfficiencyScore = 4;
    } else if (trajectoryInput.totalTokensUsed > 10000) {
      aiAssistanceEfficiencyScore = 5;
    }

    if (trajectoryInput.guardrailsTriggeredCount > 2) {
      aiAssistanceEfficiencyScore = Math.max(1, aiAssistanceEfficiencyScore - 2);
    }

    // 3c. Evidence-Driven Iteration (0 - 6 pts)
    let iterativeDebuggingScore = 3;
    if (trajectoryInput.revisionsCount >= 3) {
      iterativeDebuggingScore = 6;
    } else if (trajectoryInput.revisionsCount >= 2) {
      iterativeDebuggingScore = 5;
    }

    const engineeringTrajectoryScore = Math.min(
      20,
      Math.max(
        0,
        Math.round((verificationDisciplineScore + aiAssistanceEfficiencyScore + iterativeDebuggingScore) * 10) / 10
      )
    );

    // Total Normalized Score (0 - 100)
    const totalScore = Math.min(
      100,
      Math.max(
        0,
        Math.round((functionalScore + codeQualityScore + engineeringTrajectoryScore) * 10) / 10
      )
    );

    // Deterministic submission content hash
    const submissionContent = Object.entries(submissionFiles)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join('|');
    const submissionHash = crypto
      .createHash('sha256')
      .update(submissionContent || `${sessionId}:${Date.now()}`)
      .digest('hex')
      .slice(0, 16);

    return {
      sessionId,
      assessmentId,
      candidateId,
      challengeVersion,
      submissionHash,
      totalScore,
      pillars: {
        functionalCorrectness: {
          score: functionalScore,
          defectsResolvedCount,
          defectsBreakdown,
          baselineRegressionsPassed,
          baselineRegressionScore,
        },
        codeQuality: {
          score: codeQualityScore,
          staticAnalysisScore,
          maintainabilityScore,
          architectureComplianceScore,
          lintErrorsCount: staticAnalysisReport.lintErrors,
        },
        engineeringTrajectory: {
          score: engineeringTrajectoryScore,
          verificationDisciplineScore,
          aiAssistanceEfficiencyScore,
          iterativeDebuggingScore,
          testsRunCount: trajectoryInput.testsRunCount,
        },
      },
      evaluatedAt: new Date().toISOString(),
    };
  }
}
