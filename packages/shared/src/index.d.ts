/**
 * RepoDojo Core Shared Types & Contracts
 * Master Architecture: ADR-001-all-domains-master.md
 */
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
export type AssessmentStatus = 'CREATED' | 'PROVISIONING' | 'READY' | 'IN_PROGRESS' | 'SUBMITTING' | 'QUEUED' | 'EVALUATING' | 'COMPLETED' | 'TIMED_OUT' | 'FAILED' | 'ABANDONED';
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
export interface DefectDefinition {
    id: string;
    title: string;
    description: string;
    affectedFiles: string[];
    prerequisites: string[];
    points: number;
}
export interface ChallengeManifest {
    id: string;
    title: string;
    version: string;
    description: string;
    difficulty: 'easy' | 'medium' | 'hard';
    durationMinutes: number;
    runtime: {
        language: 'nodejs';
        nodeVersion: string;
        ports: {
            frontend: number;
            backend: number;
        };
    };
    defects: DefectDefinition[];
    rubrics: {
        functionalWeight: number;
        codeQualityWeight: number;
        trajectoryWeight: number;
    };
}
export type AssistanceLevel = 1 | 2 | 3;
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
export interface EvaluationResult {
    id: string;
    sessionId: string;
    assessmentId: string;
    candidateId: string;
    challengeVersion: string;
    submissionHash: string;
    totalScore: number;
    pillars: {
        functionalCorrectness: {
            score: number;
            defectsResolvedCount: number;
            defectsBreakdown: Record<string, {
                passed: boolean;
                assertionsPassed: number;
                totalAssertions: number;
                score: number;
            }>;
            baselineRegressionsPassed: boolean;
            baselineRegressionScore: number;
        };
        codeQuality: {
            score: number;
            staticAnalysisScore: number;
            maintainabilityScore: number;
            architectureComplianceScore: number;
            lintErrorsCount: number;
        };
        engineeringTrajectory: {
            score: number;
            verificationDisciplineScore: number;
            aiAssistanceEfficiencyScore: number;
            iterativeDebuggingScore: number;
            testsRunCount: number;
        };
    };
    evaluatedAt: string;
}
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
export interface HealthCheckResponse {
    status: 'healthy' | 'degraded' | 'unhealthy';
    service: string;
    version: string;
    timestamp: string;
    uptimeSeconds: number;
    dependencies?: Record<string, {
        status: 'up' | 'down';
        latencyMs?: number;
    }>;
}
//# sourceMappingURL=index.d.ts.map