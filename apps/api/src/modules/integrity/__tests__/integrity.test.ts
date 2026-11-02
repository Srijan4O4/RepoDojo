import path from 'path';
import { fileURLToPath } from 'url';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { app } from '../../../index.js';
import { UserModel } from '../../auth/models/user.model.js';
import { TokenService } from '../../auth/services/token.service.js';
import { AssessmentModel } from '../../assessment/models/assessment.model.js';
import { SessionEventModel } from '../models/session-event.model.js';
import {
  IntegrityService,
  determineLineBucket,
  sanitizeMetadata,
} from '../services/integrity.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'test-secret-integrity-token-12345';
  process.env.MONGOMS_DOWNLOAD_DIR = path.resolve(
    __dirname,
    '../../../../../../node_modules/.cache/mongodb-memory-server',
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
  await SessionEventModel.deleteMany({});
});

describe('Domain 15: Assessment Integrity & Proctoring Telemetry', () => {
  describe('Line Bucketing & Privacy Metadata Sanitization (Decision 15.1)', () => {
    it('should correctly bucket line counts into non-invasive categories', () => {
      expect(determineLineBucket(1)).toBe('1-5');
      expect(determineLineBucket(5)).toBe('1-5');
      expect(determineLineBucket(6)).toBe('6-15');
      expect(determineLineBucket(15)).toBe('6-15');
      expect(determineLineBucket(16)).toBe('16-50');
      expect(determineLineBucket(50)).toBe('16-50');
      expect(determineLineBucket(51)).toBe('50+');
      expect(determineLineBucket(100)).toBe('50+');
    });

    it('should strip raw clipboard content/text from metadata for privacy compliance', () => {
      const dirtyMetadata = {
        lineCount: 20,
        charCount: 450,
        targetFile: 'src/services/order.ts',
        details: {
          text: 'export function secret() { return 42; }',
          content: 'malicious leaked code',
          clipboard: 'const x = 1;',
          raw: 'function test() {}',
          cursorPosition: 120,
        },
      };

      const sanitized = sanitizeMetadata(dirtyMetadata as any);
      expect(sanitized).toBeDefined();
      expect(sanitized?.lineCountBucket).toBe('16-50');
      expect(sanitized?.details).toEqual({ cursorPosition: 120 });
      expect((sanitized?.details as any)?.text).toBeUndefined();
      expect((sanitized?.details as any)?.clipboard).toBeUndefined();
    });
  });

  describe('IntegrityService Anomaly Detection & Scoring', () => {
    it('should compute a perfect 100 advisory score for pristine session with no anomalies', async () => {
      const candidate = await UserModel.create({
        googleId: 'google-cand-1',
        email: 'cand1@repodojo.com',
        name: 'Clean Candidate',
        role: 'candidate',
      });

      const session = await AssessmentModel.create({
        candidateId: candidate._id,
        challengeId: 'node-ecommerce-01',
        challengeVersion: 'v1.0.0',
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        durationMinutes: 60,
        workspaceRevision: 1,
      });

      // Normal small paste
      await IntegrityService.recordEvent(candidate._id.toString(), {
        sessionId: session._id.toString(),
        assessmentId: session.challengeId,
        eventType: 'PASTE_EVENT',
        metadata: { lineCount: 3, charCount: 45, targetFile: 'src/utils.ts' },
      });

      // Normal short tab blur (5 seconds)
      await IntegrityService.recordEvent(candidate._id.toString(), {
        sessionId: session._id.toString(),
        assessmentId: session.challengeId,
        eventType: 'TAB_HIDDEN',
      });
      await IntegrityService.recordEvent(candidate._id.toString(), {
        sessionId: session._id.toString(),
        assessmentId: session.challengeId,
        eventType: 'TAB_VISIBLE',
        metadata: { durationMs: 5000 },
      });

      const summary = await IntegrityService.computeIntegritySummary(session._id.toString());
      expect(summary.integrityScore).toBe(100);
      expect(summary.anomalies.length).toBe(0);
      expect(summary.bulkPasteCount).toBe(0);
      expect(summary.totalTabHiddenDurationMs).toBe(5000);
      expect(summary.tabSwitchCount).toBe(1);
    });

    it('should detect prolonged tab inactivity and deduct advisory points', async () => {
      const candidate = await UserModel.create({
        googleId: 'google-cand-2',
        email: 'cand2@repodojo.com',
        name: 'Idle Candidate',
        role: 'candidate',
      });

      const session = await AssessmentModel.create({
        candidateId: candidate._id,
        challengeId: 'node-ecommerce-01',
        challengeVersion: 'v1.0.0',
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        durationMinutes: 60,
        workspaceRevision: 1,
      });

      // 4 minutes hidden tab
      await IntegrityService.recordEvent(candidate._id.toString(), {
        sessionId: session._id.toString(),
        assessmentId: session.challengeId,
        eventType: 'TAB_HIDDEN',
      });
      await IntegrityService.recordEvent(candidate._id.toString(), {
        sessionId: session._id.toString(),
        assessmentId: session.challengeId,
        eventType: 'TAB_VISIBLE',
        metadata: { durationMs: 240000 },
      });

      const summary = await IntegrityService.computeIntegritySummary(session._id.toString());
      expect(summary.anomalies.length).toBeGreaterThanOrEqual(1);
      expect(summary.anomalies[0].type).toBe('PROLONGED_TAB_INACTIVITY');
      expect(summary.integrityScore).toBeLessThan(100);
    });

    it('should detect massive bulk code insertion and deduct advisory points', async () => {
      const candidate = await UserModel.create({
        googleId: 'google-cand-3',
        email: 'cand3@repodojo.com',
        name: 'Paste Candidate',
        role: 'candidate',
      });

      const session = await AssessmentModel.create({
        candidateId: candidate._id,
        challengeId: 'node-ecommerce-01',
        challengeVersion: 'v1.0.0',
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        durationMinutes: 60,
        workspaceRevision: 1,
      });

      // 80 lines, 2500 chars paste
      await IntegrityService.recordEvent(candidate._id.toString(), {
        sessionId: session._id.toString(),
        assessmentId: session.challengeId,
        eventType: 'PASTE_EVENT',
        metadata: { lineCount: 80, charCount: 2500, targetFile: 'src/solution.ts' },
      });

      const summary = await IntegrityService.computeIntegritySummary(session._id.toString());
      expect(summary.bulkPasteCount).toBe(1);
      const pasteAnomaly = summary.anomalies.find((a) => a.type === 'RAPID_BULK_PASTE');
      expect(pasteAnomaly).toBeDefined();
      expect(pasteAnomaly?.severity).toBe('high');
      expect(summary.integrityScore).toBe(80); // 100 - 20
    });
  });

  describe('Integrity HTTP Endpoints Integration', () => {
    it('should reject unauthenticated telemetry ingestion with 401', async () => {
      const res = await request(app).post('/api/integrity/events').send({
        sessionId: new mongoose.Types.ObjectId().toString(),
        assessmentId: 'challenge-1',
        eventType: 'TAB_HIDDEN',
      });

      expect(res.status).toBe(401);
    });

    it('should ingest candidate telemetry batch with 201', async () => {
      const candidate = await UserModel.create({
        googleId: 'google-cand-batch',
        email: 'batch@repodojo.com',
        name: 'Batch Candidate',
        role: 'candidate',
      });

      const token = TokenService.generateAccessToken(candidate);

      const session = await AssessmentModel.create({
        candidateId: candidate._id,
        challengeId: 'node-ecommerce-01',
        challengeVersion: 'v1.0.0',
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        durationMinutes: 60,
        workspaceRevision: 1,
      });

      const res = await request(app)
        .post('/api/integrity/events')
        .set('Cookie', [`access_token=${token}`])
        .send({
          events: [
            {
              sessionId: session._id.toString(),
              assessmentId: session.challengeId,
              eventType: 'TAB_HIDDEN',
            },
            {
              sessionId: session._id.toString(),
              assessmentId: session.challengeId,
              eventType: 'TAB_VISIBLE',
              metadata: { durationMs: 4000 },
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.message).toContain('2');
    });

    it('should return chronological timeline and summary for session owner', async () => {
      const candidate = await UserModel.create({
        googleId: 'google-cand-timeline',
        email: 'timeline@repodojo.com',
        name: 'Timeline Candidate',
        role: 'candidate',
      });

      const token = TokenService.generateAccessToken(candidate);

      const session = await AssessmentModel.create({
        candidateId: candidate._id,
        challengeId: 'node-ecommerce-01',
        challengeVersion: 'v1.0.0',
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        durationMinutes: 60,
        workspaceRevision: 1,
      });

      await IntegrityService.recordEvent(candidate._id.toString(), {
        sessionId: session._id.toString(),
        assessmentId: session.challengeId,
        eventType: 'WINDOW_FOCUS',
      });

      const timelineRes = await request(app)
        .get(`/api/integrity/session/${session._id}/timeline`)
        .set('Cookie', [`access_token=${token}`]);

      expect(timelineRes.status).toBe(200);
      expect(timelineRes.body.timeline.length).toBe(1);
      expect(timelineRes.body.timeline[0].eventType).toBe('WINDOW_FOCUS');

      const summaryRes = await request(app)
        .get(`/api/integrity/session/${session._id}/summary`)
        .set('Cookie', [`access_token=${token}`]);

      expect(summaryRes.status).toBe(200);
      expect(summaryRes.body.summary.integrityScore).toBe(100);
    });

    it('should reject timeline access from unauthorized candidate with 403', async () => {
      const owner = await UserModel.create({
        googleId: 'google-cand-owner',
        email: 'owner@repodojo.com',
        name: 'Owner Candidate',
        role: 'candidate',
      });

      const intruder = await UserModel.create({
        googleId: 'google-cand-intruder',
        email: 'intruder@repodojo.com',
        name: 'Intruder Candidate',
        role: 'candidate',
      });

      const session = await AssessmentModel.create({
        candidateId: owner._id,
        challengeId: 'node-ecommerce-01',
        challengeVersion: 'v1.0.0',
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        durationMinutes: 60,
        workspaceRevision: 1,
      });

      const intruderToken = TokenService.generateAccessToken(intruder);

      const res = await request(app)
        .get(`/api/integrity/session/${session._id}/timeline`)
        .set('Cookie', [`access_token=${intruderToken}`]);

      expect(res.status).toBe(403);
    });

    it('should reject batch telemetry containing mixed session IDs (SEC-06)', async () => {
      const candidate = await UserModel.create({
        email: 'batch.cand@repodojo.com',
        name: 'Batch Cand',
        role: 'candidate',
      });
      const token = TokenService.generateAccessToken(candidate);

      const session1 = await AssessmentModel.create({
        candidateId: candidate._id,
        challengeId: 'node-ecommerce-01',
        status: 'IN_PROGRESS',
      });
      const otherSessionId = new mongoose.Types.ObjectId().toString();

      const events = [
        {
          sessionId: session1._id.toString(),
          assessmentId: 'node-ecommerce-01',
          eventType: 'FOCUS_CHANGE' as const,
        },
        {
          sessionId: otherSessionId,
          assessmentId: 'node-ecommerce-01',
          eventType: 'PASTE_EVENT' as const,
        },
      ];

      const res = await request(app)
        .post('/api/integrity/events')
        .set('Cookie', [`access_token=${token}`])
        .send({ events });

      expect(res.status).toBe(500);
      expect(res.body.message).toContain('Cross-session telemetry injection detected');
    });
  });
});
