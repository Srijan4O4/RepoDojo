import path from 'path';
import { fileURLToPath } from 'url';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { app } from '../../../index.js';
import { UserModel } from '../../auth/models/user.model.js';
import { TokenService } from '../../auth/services/token.service.js';
import { AssessmentModel } from '../../assessment/models/assessment.model.js';
import { AIInteractionModel } from '../models/ai-interaction.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'test-secret-ai-token-12345';
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
});

describe('Domain 8: AI Gateway & Telemetry Instrumentation', () => {
  it('GET /api/ai/session/:sessionId/budget should return 50,000 token allowance', async () => {
    const candidate = await UserModel.create({
      email: 'ai.cand@repodojo.com',
      name: 'AI Candidate',
      role: 'candidate',
    });
    const token = TokenService.generateAccessToken(candidate);

    const session = await AssessmentModel.create({
      candidateId: candidate._id,
      challengeId: 'node-ecommerce-01',
      status: 'IN_PROGRESS',
    });

    const res = await request(app)
      .get(`/api/ai/session/${session._id}/budget`)
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.budget.maxBudget).toBe(50000);
    expect(res.body.budget.remainingTokens).toBe(50000);
    expect(res.body.budget.usedTokens).toBe(0);
    expect(res.body.budget.turnCount).toBe(0);
  });

  it('POST /api/ai/chat/stream should stream SSE tokens and record telemetry in MongoDB', async () => {
    const candidate = await UserModel.create({
      email: 'stream.cand@repodojo.com',
      name: 'Stream Candidate',
      role: 'candidate',
    });
    const token = TokenService.generateAccessToken(candidate);

    const session = await AssessmentModel.create({
      candidateId: candidate._id,
      challengeId: 'node-ecommerce-01',
      status: 'IN_PROGRESS',
      workspaceRevision: 3,
    });

    const res = await request(app)
      .post('/api/ai/chat/stream')
      .set('Cookie', [`access_token=${token}`])
      .send({
        sessionId: session._id.toString(),
        prompt: 'Why does the discount calculation fail?',
        activeFile: 'src/services/payment.service.ts',
        assistanceLevel: 2,
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain('"type":"token"');
    expect(res.text).toContain('done');

    // Verify Telemetry Recorded in MongoDB (Decision 8.4)
    const interaction = await AIInteractionModel.findOne({ sessionId: session._id });
    expect(interaction).toBeDefined();
    expect(interaction?.turnNumber).toBe(1);
    expect(interaction?.prompt).toBe('Why does the discount calculation fail?');
    expect(interaction?.activeFile).toBe('src/services/payment.service.ts');
    expect(interaction?.workspaceRevisionBefore).toBe(3);
    expect(interaction?.tokensUsed.totalTokens).toBeGreaterThan(0);
  });

  it('should reject AI requests for finished/completed assessment sessions', async () => {
    const candidate = await UserModel.create({
      email: 'completed.cand@repodojo.com',
      name: 'Completed Candidate',
      role: 'candidate',
    });
    const token = TokenService.generateAccessToken(candidate);

    const session = await AssessmentModel.create({
      candidateId: candidate._id,
      challengeId: 'node-ecommerce-01',
      status: 'COMPLETED',
    });

    const res = await request(app)
      .post('/api/ai/chat/stream')
      .set('Cookie', [`access_token=${token}`])
      .send({
        sessionId: session._id.toString(),
        prompt: 'Can you help me?',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_SESSION_STATE');
  });

  it('GET /api/ai/session/:sessionId/history should retrieve recorded interaction turns', async () => {
    const candidate = await UserModel.create({
      email: 'history.cand@repodojo.com',
      name: 'History Candidate',
      role: 'candidate',
    });
    const token = TokenService.generateAccessToken(candidate);

    const session = await AssessmentModel.create({
      candidateId: candidate._id,
      challengeId: 'node-ecommerce-01',
      status: 'IN_PROGRESS',
    });

    // Create interaction record
    await AIInteractionModel.create({
      sessionId: session._id,
      candidateId: candidate._id,
      challengeId: 'node-ecommerce-01',
      turnNumber: 1,
      prompt: 'What is this codebase?',
      response: 'This is an ecommerce service.',
      assistanceLevel: 1,
      tokensUsed: { inputTokens: 50, outputTokens: 20, totalTokens: 70 },
      workspaceRevisionBefore: 1,
      workspaceRevisionAfter: 1,
      latencyMs: 120,
    });

    const res = await request(app)
      .get(`/api/ai/session/${session._id}/history`)
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.interactions[0].prompt).toBe('What is this codebase?');
    expect(res.body.interactions[0].turnNumber).toBe(1);
  });
});
