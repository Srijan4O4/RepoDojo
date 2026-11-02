import path from 'path';
import { fileURLToPath } from 'url';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { app } from '../../../index.js';
import { UserModel } from '../../auth/models/user.model.js';
import { TokenService } from '../../auth/services/token.service.js';
import { AssessmentModel } from '../../assessment/models/assessment.model.js';
import { AIInteractionModel } from '../../ai/models/ai-interaction.model.js';
import { EvaluationModel } from '../models/evaluation.model.js';
import { ScoringEngineService } from '../services/scoring-engine.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'test-secret-eval-token-12345';
  process.env.MONGOMS_DOWNLOAD_DIR = path.resolve(
    __dirname,
    '../../../../../../node_modules/.cache/mongodb-memory-server'
  );
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  await UserModel.deleteMany({});
  await AssessmentModel.deleteMany({});
  await AIInteractionModel.deleteMany({});
  await EvaluationModel.deleteMany({});
});

describe('Domain 10: 3-Pillar Evaluation & Scoring Engine', () => {
  describe('ScoringEngineService Unit Calculation (Decision 10.2)', () => {
    it('should compute full 100/100 score for flawless candidate submission', () => {
      const result = ScoringEngineService.calculateEvaluation({
        sessionId: 'session-1',
        assessmentId: 'assess-1',
        candidateId: 'cand-1',
        challengeId: 'node-ecommerce-01',
        functionalReport: {
          defects: [
            { defectId: 'DEF-01', assertionsPassed: 3, totalAssertions: 3, prerequisitesMet: true },
            { defectId: 'DEF-02', assertionsPassed: 4, totalAssertions: 4, prerequisitesMet: true },
            { defectId: 'DEF-03', assertionsPassed: 2, totalAssertions: 2, prerequisitesMet: true },
            { defectId: 'DEF-04', assertionsPassed: 3, totalAssertions: 3, prerequisitesMet: true },
            { defectId: 'DEF-05', assertionsPassed: 2, totalAssertions: 2, prerequisitesMet: true },
            { defectId: 'DEF-06', assertionsPassed: 2, totalAssertions: 2, prerequisitesMet: true },
            { defectId: 'DEF-07', assertionsPassed: 3, totalAssertions: 3, prerequisitesMet: true },
            { defectId: 'DEF-08', assertionsPassed: 2, totalAssertions: 2, prerequisitesMet: true },
          ],
          baselinePassed: 12,
          baselineTotal: 12,
        },
        staticAnalysisReport: {
          lintErrors: 0,
          typeErrors: 0,
          maxFunctionComplexity: 5,
          preservedPublicContracts: true,
        },
        trajectoryInput: {
          testsRunCount: 5,
          revisionsCount: 4,
          totalTokensUsed: 4000,
          guardrailsTriggeredCount: 0,
          aiTurnsCount: 2,
        },
      });

      expect(result.totalScore).toBe(100);
      expect(result.pillars.functionalCorrectness.score).toBe(60);
      expect(result.pillars.functionalCorrectness.defectsResolvedCount).toBe(8);
      expect(result.pillars.codeQuality.score).toBe(20);
      expect(result.pillars.engineeringTrajectory.score).toBe(20);
      expect(result.submissionHash).toBeDefined();
    });

    it('should award partial credit and zero points when prerequisites are not met', () => {
      const result = ScoringEngineService.calculateEvaluation({
        sessionId: 'session-2',
        assessmentId: 'assess-2',
        candidateId: 'cand-2',
        challengeId: 'node-ecommerce-01',
        functionalReport: {
          defects: [
            // Partial: 2 of 4 assertions passed = (2/4) * 6 = 3.0 pts
            { defectId: 'DEF-01', assertionsPassed: 2, totalAssertions: 4, prerequisitesMet: true },
            // Prereq unmet: credit must be 0
            { defectId: 'DEF-02', assertionsPassed: 3, totalAssertions: 3, prerequisitesMet: false },
          ],
          baselinePassed: 6,
          baselineTotal: 12, // (6/12) * 12 = 6.0 pts
        },
      });

      const d1 = result.pillars.functionalCorrectness.defectsBreakdown['DEF-01'];
      expect(d1.score).toBe(3);
      expect(d1.passed).toBe(false);

      const d2 = result.pillars.functionalCorrectness.defectsBreakdown['DEF-02'];
      expect(d2.score).toBe(0);
      expect(d2.passed).toBe(false);

      expect(result.pillars.functionalCorrectness.baselineRegressionScore).toBe(6);
      expect(result.pillars.functionalCorrectness.score).toBe(9); // 3 + 0 + 6 = 9
    });

    it('should not penalize candidate who solves problems without AI assistance', () => {
      const result = ScoringEngineService.calculateEvaluation({
        sessionId: 'session-3',
        assessmentId: 'assess-3',
        candidateId: 'cand-3',
        challengeId: 'node-ecommerce-01',
        functionalReport: {
          defects: [],
          baselinePassed: 12,
          baselineTotal: 12,
        },
        trajectoryInput: {
          testsRunCount: 4,
          revisionsCount: 3,
          totalTokensUsed: 0, // Zero AI tokens used!
          guardrailsTriggeredCount: 0,
          aiTurnsCount: 0,
        },
      });

      // AI assistance efficiency score should be maximum (6/6)
      expect(result.pillars.engineeringTrajectory.aiAssistanceEfficiencyScore).toBe(6);
    });
  });

  describe('Evaluation Integration Endpoints (Decision 10.3)', () => {
    it('POST /api/evaluations/session/:sessionId/submit should finalize assessment and calculate score', async () => {
      const candidate = await UserModel.create({
        email: 'eval.cand@repodojo.com',
        name: 'Eval Candidate',
        role: 'candidate',
      });
      const token = TokenService.generateAccessToken(candidate);

      const session = await AssessmentModel.create({
        candidateId: candidate._id,
        challengeId: 'node-ecommerce-01',
        status: 'IN_PROGRESS',
        workspaceRevision: 4,
      });

      // Log an AI interaction
      await AIInteractionModel.create({
        sessionId: session._id,
        candidateId: candidate._id,
        challengeId: 'node-ecommerce-01',
        turnNumber: 1,
        prompt: 'How to fix DEF-01?',
        response: 'Check routing.',
        assistanceLevel: 1,
        tokensUsed: { inputTokens: 50, outputTokens: 25, totalTokens: 75 },
      });

      const res = await request(app)
        .post(`/api/evaluations/session/${session._id}/submit`)
        .set('Cookie', [`access_token=${token}`])
        .send();

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.evaluation).toBeDefined();
      expect(res.body.evaluation.totalScore).toBeGreaterThan(0);
      expect(res.body.evaluation.pillars.functionalCorrectness.score).toBeGreaterThan(0);

      // Verify Session FSM transitioned to COMPLETED
      const updatedSession = await AssessmentModel.findById(session._id);
      expect(updatedSession?.status).toBe('COMPLETED');
      expect(updatedSession?.submittedAt).toBeDefined();

      // Verify Evaluation persisted in MongoDB
      const savedEval = await EvaluationModel.findOne({ sessionId: session._id });
      expect(savedEval).toBeDefined();
      expect(savedEval?.candidateId.toString()).toBe(candidate._id.toString());
    });

    it('GET /api/evaluations/session/:sessionId should return candidate evaluation record', async () => {
      const candidate = await UserModel.create({
        email: 'geteval.cand@repodojo.com',
        name: 'GetEval Candidate',
        role: 'candidate',
      });
      const token = TokenService.generateAccessToken(candidate);

      const session = await AssessmentModel.create({
        candidateId: candidate._id,
        challengeId: 'node-ecommerce-01',
        status: 'COMPLETED',
      });

      await EvaluationModel.create({
        sessionId: session._id,
        assessmentId: session._id,
        candidateId: candidate._id,
        challengeId: 'node-ecommerce-01',
        totalScore: 78.5,
        submissionHash: 'a1b2c3d4e5f6',
        pillars: {
          functionalCorrectness: {
            score: 42,
            defectsResolvedCount: 6,
            defectsBreakdown: {},
            baselineRegressionsPassed: true,
            baselineRegressionScore: 12,
          },
          codeQuality: {
            score: 18.5,
            staticAnalysisScore: 7.5,
            maintainabilityScore: 7.0,
            architectureComplianceScore: 4.0,
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
      });

      const res = await request(app)
        .get(`/api/evaluations/session/${session._id}`)
        .set('Cookie', [`access_token=${token}`]);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.evaluation.totalScore).toBe(78.5);
      expect(res.body.evaluation.pillars.functionalCorrectness.score).toBe(42);
    });
  });
});
