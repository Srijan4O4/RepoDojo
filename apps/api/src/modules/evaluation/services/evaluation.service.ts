import { AssessmentModel } from '../../assessment/models/assessment.model.js';
import { AIInteractionModel } from '../../ai/models/ai-interaction.model.js';
import { EvaluationModel, EvaluationDocument } from '../models/evaluation.model.js';
import {
  ScoringEngineService,
  FunctionalTestReport,
  StaticAnalysisReport,
  TrajectoryTelemetryInput,
} from './scoring-engine.service.js';

export class EvaluationService {
  /**
   * Orchestrates the evaluation lifecycle for an assessment session.
   * Freezes submission, processes 3 pillars, updates state to COMPLETED,
   * and saves an immutable Evaluation document (Decision 10.1 & 10.3).
   */
  public static async evaluateSession(
    sessionId: string,
    overrides?: {
      functionalReport?: FunctionalTestReport;
      staticAnalysisReport?: StaticAnalysisReport;
      testsRunCount?: number;
    }
  ): Promise<EvaluationDocument> {
    const startTime = Date.now();

    const session = await AssessmentModel.findById(sessionId);
    if (!session) {
      throw new Error(`Assessment session "${sessionId}" not found.`);
    }

    // 1. Gather Candidate AI Trajectory Telemetry (Decision 8.4 & 10.2)
    const interactions = await AIInteractionModel.find({ sessionId });
    const totalTokensUsed = interactions.reduce(
      (sum, item) => sum + (item.tokensUsed?.totalTokens || 0),
      0
    );
    const guardrailsTriggeredCount = interactions.filter(
      (item) => item.guardrailTriggered
    ).length;
    const aiTurnsCount = interactions.length;

    const trajectoryInput: TrajectoryTelemetryInput = {
      testsRunCount: overrides?.testsRunCount ?? 3,
      revisionsCount: session.workspaceRevision || 1,
      totalTokensUsed,
      guardrailsTriggeredCount,
      aiTurnsCount,
    };

    // 2. Default or Simulated Functional Test Execution Report
    // (8 defect checks + baseline regression suite)
    const functionalReport: FunctionalTestReport = overrides?.functionalReport ?? {
      defects: [
        { defectId: 'DEF-01', assertionsPassed: 3, totalAssertions: 3, prerequisitesMet: true },
        { defectId: 'DEF-02', assertionsPassed: 4, totalAssertions: 4, prerequisitesMet: true },
        { defectId: 'DEF-03', assertionsPassed: 2, totalAssertions: 2, prerequisitesMet: true },
        { defectId: 'DEF-04', assertionsPassed: 3, totalAssertions: 3, prerequisitesMet: true },
        { defectId: 'DEF-05', assertionsPassed: 2, totalAssertions: 2, prerequisitesMet: true },
        { defectId: 'DEF-06', assertionsPassed: 1, totalAssertions: 2, prerequisitesMet: true }, // Partial
        { defectId: 'DEF-07', assertionsPassed: 0, totalAssertions: 3, prerequisitesMet: true }, // Failed
        { defectId: 'DEF-08', assertionsPassed: 0, totalAssertions: 2, prerequisitesMet: false }, // Prereq unmet
      ],
      baselinePassed: 12,
      baselineTotal: 12,
    };

    const staticAnalysisReport: StaticAnalysisReport = overrides?.staticAnalysisReport ?? {
      lintErrors: 0,
      typeErrors: 0,
      maxFunctionComplexity: 6,
      preservedPublicContracts: true,
    };

    // 3. Compute 3-Pillar Deterministic Score
    const calculated = ScoringEngineService.calculateEvaluation({
      sessionId: session._id.toString(),
      assessmentId: session._id.toString(),
      candidateId: session.candidateId.toString(),
      challengeId: session.challengeId,
      challengeVersion: session.challengeVersion || '1.0.0',
      functionalReport,
      staticAnalysisReport,
      trajectoryInput,
    });

    const executionTimeMs = Date.now() - startTime;

    // 4. Save Immutable Evaluation Document
    const evaluation = await EvaluationModel.create({
      ...calculated,
      challengeId: session.challengeId,
      executionTimeMs,
    });

    // 5. Update Assessment Status FSM -> COMPLETED
    session.status = 'COMPLETED';
    session.submittedAt = new Date();
    await session.save();

    return evaluation;
  }

  /**
   * Retrieves an evaluation record for a given session.
   */
  public static async getEvaluation(sessionId: string): Promise<EvaluationDocument | null> {
    return EvaluationModel.findOne({ sessionId });
  }
}
