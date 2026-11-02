import path from 'path';
import { fileURLToPath } from 'url';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { app } from '../../../index.js';
import { UserModel } from '../../auth/models/user.model.js';
import { TokenService } from '../../auth/services/token.service.js';
import { AssessmentModel } from '../models/assessment.model.js';
import { OutboxJobModel } from '../models/outbox-job.model.js';
import { AssessmentLifecycleService } from '../services/assessment-lifecycle.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'test-secret-assessment-token-12345';
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
  await OutboxJobModel.deleteMany({});
});

describe('Domain 4: Assessment Lifecycle Management', () => {
  describe('Session Creation & Concurrency Control (Decision 4.3)', () => {
    it('should create an assessment session with default CREATED status', async () => {
      const candidate = await UserModel.create({
        email: 'cand1@repodojo.com',
        name: 'Cand One',
        role: 'candidate',
      });
      const token = TokenService.generateAccessToken(candidate);

      const res = await request(app)
        .post('/api/assessments')
        .set('Cookie', [`access_token=${token}`])
        .send({
          challengeId: 'node-ecommerce-api-01',
          challengeVersion: 'v1.0.0',
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.session.status).toBe('CREATED');
      expect(res.body.session.challengeId).toBe('node-ecommerce-api-01');
      expect(res.body.session.durationMinutes).toBe(60);
    });

    it('should safely return existing session when duplicate idempotencyKey is used', async () => {
      const candidate = await UserModel.create({
        email: 'cand2@repodojo.com',
        name: 'Cand Two',
        role: 'candidate',
      });
      const token = TokenService.generateAccessToken(candidate);

      const reqPayload = {
        challengeId: 'node-ecommerce-api-01',
        idempotencyKey: 'client-uuid-999-aaa',
      };

      const firstRes = await request(app)
        .post('/api/assessments')
        .set('Cookie', [`access_token=${token}`])
        .send(reqPayload);

      expect(firstRes.status).toBe(201);
      const sessionId = firstRes.body.session.id;

      // Replay identical request with same idempotencyKey
      const secondRes = await request(app)
        .post('/api/assessments')
        .set('Cookie', [`access_token=${token}`])
        .send(reqPayload);

      expect(secondRes.status).toBe(201);
      expect(secondRes.body.session.id).toBe(sessionId);
    });

    it('should reject a second active session for candidate with 409 CONFLICT (Decision 4.3)', async () => {
      const candidate = await UserModel.create({
        email: 'cand3@repodojo.com',
        name: 'Cand Three',
        role: 'candidate',
      });
      const token = TokenService.generateAccessToken(candidate);

      // Create first session
      const firstRes = await request(app)
        .post('/api/assessments')
        .set('Cookie', [`access_token=${token}`])
        .send({ challengeId: 'challenge-alpha' });
      expect(firstRes.status).toBe(201);

      // Attempt second session while first is active
      const secondRes = await request(app)
        .post('/api/assessments')
        .set('Cookie', [`access_token=${token}`])
        .send({ challengeId: 'challenge-beta' });

      expect(secondRes.status).toBe(409);
      expect(secondRes.body.error).toBe('ACTIVE_SESSION_EXISTS');
    });
  });

  describe('Server-Authoritative Timer & FSM Transitions (Decision 4.1 & 4.2)', () => {
    it('POST /api/assessments/:id/start should arm the 60-minute expiration timer', async () => {
      const candidate = await UserModel.create({
        email: 'cand4@repodojo.com',
        name: 'Cand Four',
        role: 'candidate',
      });
      const token = TokenService.generateAccessToken(candidate);

      const session = await AssessmentLifecycleService.createSession({
        candidateId: candidate._id.toString(),
        challengeId: 'challenge-alpha',
        durationMinutes: 60,
      });

      const startRes = await request(app)
        .post(`/api/assessments/${session._id}/start`)
        .set('Cookie', [`access_token=${token}`]);

      expect(startRes.status).toBe(200);
      expect(startRes.body.session.status).toBe('IN_PROGRESS');
      expect(startRes.body.session.startedAt).toBeDefined();
      expect(startRes.body.session.expiresAt).toBeDefined();

      const startedAt = new Date(startRes.body.session.startedAt).getTime();
      const expiresAt = new Date(startRes.body.session.expiresAt).getTime();
      const diffMinutes = Math.round((expiresAt - startedAt) / (60 * 1000));
      expect(diffMinutes).toBe(60);
    });

    it('GET /api/assessments/active should return remainingSeconds and clock-drift serverTime', async () => {
      const candidate = await UserModel.create({
        email: 'cand5@repodojo.com',
        name: 'Cand Five',
        role: 'candidate',
      });
      const token = TokenService.generateAccessToken(candidate);

      const session = await AssessmentLifecycleService.createSession({
        candidateId: candidate._id.toString(),
        challengeId: 'challenge-alpha',
        durationMinutes: 45,
      });

      await AssessmentLifecycleService.startSession(session._id.toString(), candidate._id.toString());

      const res = await request(app)
        .get('/api/assessments/active')
        .set('Cookie', [`access_token=${token}`]);

      expect(res.status).toBe(200);
      expect(res.body.active).toBe(true);
      expect(res.body.remainingSeconds).toBeGreaterThan(44 * 60);
      expect(res.body.remainingSeconds).toBeLessThanOrEqual(45 * 60);
      expect(res.body.serverTime).toBeDefined();
    });

    it('POST /api/assessments/:id/heartbeat should update lastHeartbeatAt', async () => {
      const candidate = await UserModel.create({
        email: 'cand6@repodojo.com',
        name: 'Cand Six',
        role: 'candidate',
      });
      const token = TokenService.generateAccessToken(candidate);

      const session = await AssessmentLifecycleService.createSession({
        candidateId: candidate._id.toString(),
        challengeId: 'challenge-alpha',
      });

      await AssessmentLifecycleService.startSession(session._id.toString(), candidate._id.toString());

      const hbRes = await request(app)
        .post(`/api/assessments/${session._id}/heartbeat`)
        .set('Cookie', [`access_token=${token}`]);

      expect(hbRes.status).toBe(200);
      expect(hbRes.body.status).toBe('IN_PROGRESS');
      expect(hbRes.body.isExpired).toBe(false);
      expect(hbRes.body.remainingSeconds).toBeGreaterThan(0);

      const dbSession = await AssessmentModel.findById(session._id);
      expect(dbSession?.lastHeartbeatAt).toBeDefined();
    });

    it('Heartbeat after expiresAt should automatically transition to TIMED_OUT and queue outbox', async () => {
      const candidate = await UserModel.create({
        email: 'cand7@repodojo.com',
        name: 'Cand Seven',
        role: 'candidate',
      });
      const token = TokenService.generateAccessToken(candidate);

      // Create session with past expiresAt
      const session = await AssessmentModel.create({
        candidateId: candidate._id,
        challengeId: 'challenge-alpha',
        status: 'IN_PROGRESS',
        startedAt: new Date(Date.now() - 70 * 60 * 1000),
        expiresAt: new Date(Date.now() - 10 * 60 * 1000), // expired 10 minutes ago
        durationMinutes: 60,
      });

      const hbRes = await request(app)
        .post(`/api/assessments/${session._id}/heartbeat`)
        .set('Cookie', [`access_token=${token}`]);

      expect(hbRes.status).toBe(200);
      expect(hbRes.body.status).toBe('TIMED_OUT');
      expect(hbRes.body.isExpired).toBe(true);
      expect(hbRes.body.remainingSeconds).toBe(0);

      // Check Outbox Job created
      const outbox = await OutboxJobModel.findOne({ assessmentId: session._id });
      expect(outbox).toBeDefined();
      expect(outbox?.status).toBe('PENDING');
    });
  });

  describe('Submission & Transactional Outbox (Contract §3 & §4)', () => {
    it('POST /api/assessments/:id/submit should transition to QUEUED and insert outbox job', async () => {
      const candidate = await UserModel.create({
        email: 'cand8@repodojo.com',
        name: 'Cand Eight',
        role: 'candidate',
      });
      const token = TokenService.generateAccessToken(candidate);

      const session = await AssessmentLifecycleService.createSession({
        candidateId: candidate._id.toString(),
        challengeId: 'challenge-alpha',
      });

      await AssessmentLifecycleService.startSession(session._id.toString(), candidate._id.toString());

      const submitRes = await request(app)
        .post(`/api/assessments/${session._id}/submit`)
        .set('Cookie', [`access_token=${token}`])
        .send({
          metadata: {
            monacoRevision: 42,
            testsRun: 5,
          },
        });

      expect(submitRes.status).toBe(200);
      expect(submitRes.body.session.status).toBe('QUEUED');
      expect(submitRes.body.session.submittedAt).toBeDefined();

      // Check Outbox Job created
      const outbox = await OutboxJobModel.findOne({ assessmentId: session._id });
      expect(outbox).toBeDefined();
      expect(outbox?.status).toBe('PENDING');
      expect(outbox?.submissionId).toBeDefined();
    });

    it('Background sweeper should detect overdue sessions and auto-submit them', async () => {
      const candidate = await UserModel.create({
        email: 'cand9@repodojo.com',
        name: 'Cand Nine',
        role: 'candidate',
      });

      // Overdue session
      const overdueSession = await AssessmentModel.create({
        candidateId: candidate._id,
        challengeId: 'challenge-sweeper',
        status: 'IN_PROGRESS',
        startedAt: new Date(Date.now() - 65 * 60 * 1000),
        expiresAt: new Date(Date.now() - 5 * 60 * 1000),
        durationMinutes: 60,
      });

      const sweptCount = await AssessmentLifecycleService.sweepExpiredSessions();
      expect(sweptCount).toBe(1);

      const reloaded = await AssessmentModel.findById(overdueSession._id);
      expect(reloaded?.status).toBe('QUEUED');

      const outbox = await OutboxJobModel.findOne({ assessmentId: overdueSession._id });
      expect(outbox).toBeDefined();
    });

    it('Accessing another candidate session should return 403 FORBIDDEN', async () => {
      const owner = await UserModel.create({
        email: 'owner@repodojo.com',
        name: 'Owner',
        role: 'candidate',
      });

      const intruder = await UserModel.create({
        email: 'intruder@repodojo.com',
        name: 'Intruder',
        role: 'candidate',
      });

      const session = await AssessmentLifecycleService.createSession({
        candidateId: owner._id.toString(),
        challengeId: 'challenge-alpha',
      });

      const intruderToken = TokenService.generateAccessToken(intruder);

      const res = await request(app)
        .get(`/api/assessments/${session._id}`)
        .set('Cookie', [`access_token=${intruderToken}`]);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
    });
  });
});
