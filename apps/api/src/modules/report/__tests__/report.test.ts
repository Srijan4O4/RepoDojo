import path from 'path';
import { fileURLToPath } from 'url';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { app } from '../../../index.js';
import { UserModel } from '../../auth/models/user.model.js';
import { TokenService } from '../../auth/services/token.service.js';
import { AssessmentModel } from '../../assessment/models/assessment.model.js';
import { EvaluationModel } from '../../evaluation/models/evaluation.model.js';
import { ReportModel } from '../models/report.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'test-secret-report-token-12345';
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
  await EvaluationModel.deleteMany({});
  await ReportModel.deleteMany({});
});

describe('Domain 11: Candidate Feedback & Performance Report Generation', () => {
  it('POST /api/reports/session/:sessionId/generate should synthesize and persist report', async () => {
    const candidate = await UserModel.create({
      email: 'report.cand@repodojo.com',
      name: 'Report Candidate',
      role: 'candidate',
    });
    const token = TokenService.generateAccessToken(candidate);

    const session = await AssessmentModel.create({
      candidateId: candidate._id,
      challengeId: 'node-ecommerce-01',
      status: 'COMPLETED',
    });

    const evaluation = await EvaluationModel.create({
      sessionId: session._id,
      assessmentId: session._id,
      candidateId: candidate._id,
      challengeId: 'node-ecommerce-01',
      totalScore: 84.0,
      submissionHash: 'c4d5e6f7a8b9',
      pillars: {
        functionalCorrectness: {
          score: 48,
          defectsResolvedCount: 7,
          defectsBreakdown: {},
          baselineRegressionsPassed: true,
          baselineRegressionScore: 12,
        },
        codeQuality: {
          score: 18,
          staticAnalysisScore: 8,
          maintainabilityScore: 7,
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
    });

    const res = await request(app)
      .post(`/api/reports/session/${session._id}/generate`)
      .set('Cookie', [`access_token=${token}`])
      .send();

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.report).toBeDefined();
    expect(res.body.report.totalScore).toBe(84);
    expect(res.body.report.executiveSummary).toBeDefined();
    expect(res.body.report.strengths.length).toBeGreaterThan(0);
    expect(res.body.report.areasForImprovement.length).toBeGreaterThan(0);
    expect(res.body.report.practiceRecommendations.length).toBeGreaterThan(0);
    expect(res.body.report.shareToken).toBeDefined();

    // Verify persisted in MongoDB
    const saved = await ReportModel.findOne({ sessionId: session._id });
    expect(saved).toBeDefined();
    expect(saved?.shareToken).toBe(res.body.report.shareToken);
  });

  it('GET /api/reports/shared/:shareToken should return public sanitized report without PII', async () => {
    const candidate = await UserModel.create({
      email: 'public.cand@repodojo.com',
      name: 'Public Candidate',
      role: 'candidate',
    });

    const session = await AssessmentModel.create({
      candidateId: candidate._id,
      challengeId: 'node-ecommerce-01',
      status: 'COMPLETED',
    });

    const evaluation = await EvaluationModel.create({
      sessionId: session._id,
      assessmentId: session._id,
      candidateId: candidate._id,
      challengeId: 'node-ecommerce-01',
      totalScore: 91.0,
      submissionHash: 'pub123hash',
      pillars: {
        functionalCorrectness: {
          score: 54,
          defectsResolvedCount: 8,
          defectsBreakdown: {},
          baselineRegressionsPassed: true,
          baselineRegressionScore: 12,
        },
        codeQuality: {
          score: 19,
          staticAnalysisScore: 8,
          maintainabilityScore: 8,
          architectureComplianceScore: 3,
          lintErrorsCount: 0,
        },
        engineeringTrajectory: {
          score: 18,
          verificationDisciplineScore: 8,
          aiAssistanceEfficiencyScore: 5,
          iterativeDebuggingScore: 5,
          testsRunCount: 5,
        },
      },
    });

    const report = await ReportModel.create({
      assessmentId: session._id,
      sessionId: session._id,
      evaluationId: evaluation._id,
      candidateId: candidate._id,
      totalScore: 91.0,
      executiveSummary: 'Outstanding performance resolving all 8 defects.',
      strengths: ['Flawless defect resolution', 'Excellent regression control'],
      areasForImprovement: ['Refactor monolithic route handlers into micro-services'],
      practiceRecommendations: ['Distributed transactions'],
      shareToken: 'secret-public-share-token-xyz',
    });

    // Unauthenticated GET request to shared endpoint
    const res = await request(app).get(`/api/reports/shared/${report.shareToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.report.totalScore).toBe(91);
    expect(res.body.report.executiveSummary).toContain('Outstanding performance');
    // Ensure sensitive fields (candidateId, assessmentId, sessionId) are NOT leaked
    expect(res.body.report.candidateId).toBeUndefined();
    expect(res.body.report.sessionId).toBeUndefined();
  });
});
