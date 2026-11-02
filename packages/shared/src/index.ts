/**
 * RepoDojo Core Shared Types & Contracts
 * Master Architecture: ADR-001-all-domains-master.md
 */

// =============================================================================
// Domain 3: User & Auth
// =============================================================================
export type UserRole = 'candidate' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// Domain 4: Assessment Lifecycle State Machine (FSM)
// =============================================================================
export type AssessmentStatus =
  | 'CREATED'
  | 'PROVISIONING'
  | 'READY'
  | 'IN_PROGRESS'
  | 'SUBMITTING'
  | 'QUEUED'
  | 'EVALUATING'
  | 'COMPLETED'
  | 'TIMED_OUT'
  | 'FAILED'
  | 'ABANDONED';

export interface AssessmentSession {
  id: string;
  candidateId: string;
  challengeId: string;
  challengeVersion: string;
  status: AssessmentStatus;
  startedAt?: string;
  expiresAt?: string;
  submittedAt?: string;
  durationMinutes: number;
  workspaceRevision: number;
  previewUrl?: string;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// Domain 5: Challenge Specification
// =============================================================================
export interface DefectDefinition {
  id: string;
  title: string;
  description: string;
  affectedFiles: string[];
  prerequisites: string[]; // DAG dependency IDs
  points: number; // Max 6 pts per defect
}

export interface ChallengeManifest {
  id: string;
  title: string;
  version: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  durationMinutes: number; // Standard: 60 minutes
  runtime: {
    language: 'nodejs';
    nodeVersion: string;
    ports: {
      frontend: number;
      backend: number;
    };
  };
  defects: DefectDefinition[]; // Exactly 8 defects
  rubrics: {
    functionalWeight: number; // 60
    codeQualityWeight: number; // 20
    trajectoryWeight: number; // 20
  };
}

// =============================================================================
// Domain 8: AI Assistant & Telemetry
// =============================================================================
export type AssistanceLevel = 1 | 2 | 3; // 1: Conceptual, 2: File Locator, 3: Debugging Guidance

export interface AIInteraction {
  id: string;
  sessionId: string;
  assessmentId: string;
  candidateId: string;
  turnNumber: number;
  timestamp: string;
  prompt: string;
  response: string;
  latencyMs: number;
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  guardrailTriggered: boolean;
  assistanceLevel: AssistanceLevel;
  workspaceRevisionBefore: number;
  workspaceRevisionAfter?: number;
}

// =============================================================================
// Domain 10: Evaluation & 3-Pillar Scoring (0-100)
// =============================================================================
export interface EvaluationResult {
  id: string;
  sessionId: string;
  assessmentId: string;
  candidateId: string;
  challengeVersion: string;
  submissionHash: string;
  totalScore: number; // 0 - 100
  pillars: {
    functionalCorrectness: {
      score: number; // 0 - 60
      defectsResolvedCount: number; // out of 8
      defectsBreakdown: Record<
        string,
        {
          passed: boolean;
          assertionsPassed: number;
          totalAssertions: number;
          score: number;
        }
      >;
      baselineRegressionsPassed: boolean;
      baselineRegressionScore: number; // out of 12
    };
    codeQuality: {
      score: number; // 0 - 20
      staticAnalysisScore: number; // out of 8
      maintainabilityScore: number; // out of 8
      architectureComplianceScore: number; // out of 4
      lintErrorsCount: number;
    };
    engineeringTrajectory: {
      score: number; // 0 - 20
      verificationDisciplineScore: number; // out of 8
      aiAssistanceEfficiencyScore: number; // out of 6
      iterativeDebuggingScore: number; // out of 6
      testsRunCount: number;
    };
  };
  evaluatedAt: string;
}

// =============================================================================
// Domain 11: Candidate Performance Report
// =============================================================================
export interface PerformanceReport {
  id: string;
  assessmentId: string;
  evaluationId: string;
  candidateId: string;
  totalScore: number;
  executiveSummary: string;
  strengths: string[];
  areasForImprovement: string[];
  practiceRecommendations: string[];
  shareToken?: string;
  generatedAt: string;
}

// =============================================================================
// Domain 13: Observability Probes
// =============================================================================
export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  service: string;
  version: string;
  timestamp: string;
  uptimeSeconds: number;
  dependencies?: Record<string, { status: 'up' | 'down'; latencyMs?: number }>;
}
