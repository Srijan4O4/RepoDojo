import path from 'path';
import { fileURLToPath } from 'url';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { app } from '../../../index.js';
import { AlertService } from '../services/alert.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
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

beforeEach(() => {
  AlertService.clearAlerts();
});

describe('Domain 13: Observability, Distributed Tracing & Health Probes', () => {
  describe('W3C Distributed Tracing & Correlation Middleware (ADR-001 Decision 13.1)', () => {
    it('should inject W3C traceparent, X-Trace-Id, and X-Correlation-Id headers', async () => {
      const res = await request(app).get('/');

      expect(res.status).toBe(200);
      expect(res.headers['x-trace-id']).toBeDefined();
      expect(res.headers['x-trace-id']).toMatch(/^[0-9a-f]{32}$/);
      expect(res.headers['x-span-id']).toBeDefined();
      expect(res.headers['x-span-id']).toMatch(/^[0-9a-f]{16}$/);
      expect(res.headers['x-correlation-id']).toBeDefined();
      expect(res.headers['traceparent']).toContain(res.headers['x-trace-id']);
    });

    it('should propagate incoming W3C traceparent header across services', async () => {
      const externalTraceId = '4bf92f3577b34da6a3ce929d0e0e4736';
      const incomingTraceparent = `00-${externalTraceId}-00f067aa0ba902b7-01`;

      const res = await request(app)
        .get('/')
        .set('traceparent', incomingTraceparent)
        .set('x-correlation-id', 'test-client-corr-1234');

      expect(res.headers['x-trace-id']).toBe(externalTraceId);
      expect(res.headers['x-correlation-id']).toBe('test-client-corr-1234');
      expect(res.headers['traceparent']).toContain(externalTraceId);
    });
  });

  describe('3-Stage Health Probes (ADR-001 Decision 13.2)', () => {
    it('GET /startupz should return 200 started', async () => {
      const res = await request(app).get('/startupz');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('started');
      expect(res.body.service).toBe('@repodojo/api');
      expect(res.body.timestamp).toBeDefined();
    });

    it('GET /livez should return 200 alive with uptime metrics (<5ms check)', async () => {
      const res = await request(app).get('/livez');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('alive');
      expect(typeof res.body.uptimeSeconds).toBe('number');
    });

    it('GET /readyz should return 200 healthy when MongoDB is connected', async () => {
      const res = await request(app).get('/readyz');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body.dependencies.mongodb.status).toBe('up');
      expect(res.body.dependencies.redis.status).toBe('up');
    });
  });

  describe('Operational Alerting & SLO Triggers (ADR-001 Decision 13.2 & PRD §12.3)', () => {
    it('should dispatch high-signal operational alerts and throttle duplicates', async () => {
      // 1. Dispatch first alert
      const alert1 = await AlertService.dispatchAlert({
        type: 'ALERT_SANDBOX_PROVISION_FAILURE',
        message: 'Sandbox boot failed for session 123',
        sessionId: 'session-123',
      });

      expect(alert1).toBeDefined();
      expect(alert1?.type).toBe('ALERT_SANDBOX_PROVISION_FAILURE');
      expect(alert1?.severity).toBe('P2_HIGH');

      // 2. Dispatch duplicate alert immediately (should be throttled within 60s window)
      const duplicateAlert = await AlertService.dispatchAlert({
        type: 'ALERT_SANDBOX_PROVISION_FAILURE',
        message: 'Sandbox boot failed again',
        sessionId: 'session-123',
      });
      expect(duplicateAlert).toBeNull();

      // 3. Dispatch critical P1 alert for database failure
      const alertP1 = await AlertService.dispatchAlert({
        type: 'ALERT_DATABASE_UNAVAILABLE',
        message: 'MongoDB primary connection dropped',
      });
      expect(alertP1).toBeDefined();
      expect(alertP1?.severity).toBe('P1_CRITICAL');

      // 4. Verify alerts returned via diagnostics API
      const res = await request(app).get('/api/observability/alerts');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.alerts.length).toBe(2);
      expect(res.body.alerts[0].type).toBe('ALERT_DATABASE_UNAVAILABLE');
    });
  });
});
