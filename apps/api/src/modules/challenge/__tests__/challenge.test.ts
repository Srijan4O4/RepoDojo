import path from 'path';
import { fileURLToPath } from 'url';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { app } from '../../../index.js';
import { UserModel } from '../../auth/models/user.model.js';
import { TokenService } from '../../auth/services/token.service.js';
import { ChallengeModel } from '../models/challenge.model.js';
import { ChallengeValidatorService } from '../services/challenge-validator.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'test-secret-challenge-token-12345';
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
  await ChallengeModel.deleteMany({});
});

const VALID_8_DEFECTS_YAML = `
id: node-ecommerce-01
title: Node.js E-Commerce Microservice
version: v1.0.0
description: Medium complexity full-stack repository with 8 intentional defects.
difficulty: medium
durationMinutes: 60
runtime:
  language: nodejs
  nodeVersion: "22"
  ports:
    frontend: 5173
    backend: 5000
rubrics:
  functionalWeight: 60
  codeQualityWeight: 20
  trajectoryWeight: 20
defects:
  - id: DEF-01
    title: Missing CORS headers
    description: Client requests fail due to missing Access-Control headers.
    affectedFiles: ["src/index.ts"]
    prerequisites: []
    points: 6
  - id: DEF-02
    title: Off-by-one Discount Calculation
    description: Discount math fails on edge quantities.
    affectedFiles: ["src/controllers/order.controller.ts"]
    prerequisites: ["DEF-01"]
    points: 6
  - id: DEF-03
    title: Unawaited Payment Gateway Promise
    description: Missing await on payment gateway network call.
    affectedFiles: ["src/controllers/order.controller.ts"]
    prerequisites: ["DEF-02"]
    points: 6
  - id: DEF-04
    title: Inverted Promo Multiplier
    description: Discount calculation inverts multiplier logic.
    affectedFiles: ["src/services/payment.service.ts"]
    prerequisites: ["DEF-02"]
    points: 6
  - id: DEF-05
    title: Unhandled Stripe Webhook Idempotency
    description: Duplicate webhooks trigger duplicate order fulfillment.
    affectedFiles: ["src/controllers/webhook.controller.ts"]
    prerequisites: ["DEF-03"]
    points: 6
  - id: DEF-06
    title: Cart Item Cache Stale Invalidation
    description: Redis cache not purged after item removal.
    affectedFiles: ["src/services/cart.service.ts"]
    prerequisites: []
    points: 6
  - id: DEF-07
    title: Missing Order Number Sequence Lock
    description: Concurrency race condition on order sequence generator.
    affectedFiles: ["src/models/order.model.ts"]
    prerequisites: ["DEF-05"]
    points: 6
  - id: DEF-08
    title: Email Notification Template Variable Typo
    description: Template rendering throws TypeError when customerName is undefined.
    affectedFiles: ["src/services/email.service.ts"]
    prerequisites: ["DEF-07"]
    points: 6
`;

describe('Domain 5: Repository & Challenge Management', () => {
  describe('ChallengeValidatorService (Decision 5.2)', () => {
    it('should successfully validate a conformant repodojo.challenge.yml with 8 defects', () => {
      const result = ChallengeValidatorService.validateYaml(VALID_8_DEFECTS_YAML);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
      expect(result.manifest?.defects.length).toBe(8);
      expect(result.manifestHash).toBeDefined();
    });

    it('should reject manifest with fewer or more than 8 defects', () => {
      const defect8Block = `  - id: DEF-08
    title: Email Notification Template Variable Typo
    description: Template rendering throws TypeError when customerName is undefined.
    affectedFiles: ["src/services/email.service.ts"]
    prerequisites: ["DEF-07"]
    points: 6`;
      const invalidYaml = VALID_8_DEFECTS_YAML.replace(defect8Block, '');
      const result = ChallengeValidatorService.validateYaml(invalidYaml);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('exactly 8 defects'))).toBe(true);
    });

    it('should detect and reject DAG dependency cycles in defect prerequisites', () => {
      // Create a cycle: DEF-01 -> DEF-02 -> DEF-01
      const cyclicYaml = VALID_8_DEFECTS_YAML.replace('prerequisites: []\n    points: 6', 'prerequisites: ["DEF-02"]\n    points: 6');
      const result = ChallengeValidatorService.validateYaml(cyclicYaml);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('DAG Dependency Cycle detected'))).toBe(true);
    });

    it('should reject rubric weights that do not sum to 100', () => {
      const invalidRubricYaml = VALID_8_DEFECTS_YAML.replace('functionalWeight: 60', 'functionalWeight: 80');
      const result = ChallengeValidatorService.validateYaml(invalidRubricYaml);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('must sum to 100'))).toBe(true);
    });
  });

  describe('Challenge Endpoints & Admin Sync', () => {
    it('POST /api/challenges/sync should sync and publish challenge (admin only)', async () => {
      const admin = await UserModel.create({
        email: 'admin@repodojo.com',
        name: 'Platform Admin',
        role: 'admin',
      });
      const adminToken = TokenService.generateAccessToken(admin);

      const res = await request(app)
        .post('/api/challenges/sync')
        .set('Cookie', [`access_token=${adminToken}`])
        .send({
          yamlContent: VALID_8_DEFECTS_YAML,
          starterFiles: {
            'src/index.ts': 'console.log("hello");',
            'package.json': '{"name": "test"}',
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.challenge.id).toBe('node-ecommerce-01');

      // Check DB projection
      const saved = await ChallengeModel.findOne({ id: 'node-ecommerce-01' });
      expect(saved).toBeDefined();
      expect(saved?.defects.length).toBe(8);
      expect(saved?.isPublished).toBe(true);
    });

    it('GET /api/challenges should list published challenges', async () => {
      await ChallengeModel.create({
        id: 'challenge-catalog-01',
        title: 'Catalog Challenge',
        version: 'v1.0.0',
        description: 'Testing catalog list.',
        difficulty: 'medium',
        durationMinutes: 60,
        runtime: { language: 'nodejs', nodeVersion: '22', ports: { frontend: 5173, backend: 5000 } },
        defects: Array.from({ length: 8 }, (_, i) => ({
          id: `DEF-0${i + 1}`,
          title: `Defect ${i + 1}`,
          description: `Desc ${i + 1}`,
          affectedFiles: ['src/file.ts'],
          prerequisites: [],
          points: 6,
        })),
        rubrics: { functionalWeight: 60, codeQualityWeight: 20, trajectoryWeight: 20 },
        manifestHash: 'hash-abc-123',
        isPublished: true,
      });

      const res = await request(app).get('/api/challenges');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.challenges.length).toBeGreaterThan(0);
      expect(res.body.challenges[0].id).toBe('challenge-catalog-01');
    });

    it('GET /api/challenges/:id should retrieve specific challenge with starter files', async () => {
      await ChallengeModel.create({
        id: 'challenge-starter-01',
        title: 'Starter Challenge',
        version: 'v1.0.0',
        description: 'Testing starter retrieval.',
        difficulty: 'easy',
        durationMinutes: 60,
        runtime: { language: 'nodejs', nodeVersion: '22', ports: { frontend: 5173, backend: 5000 } },
        defects: Array.from({ length: 8 }, (_, i) => ({
          id: `DEF-0${i + 1}`,
          title: `Defect ${i + 1}`,
          description: `Desc ${i + 1}`,
          affectedFiles: ['src/file.ts'],
          prerequisites: [],
          points: 6,
        })),
        rubrics: { functionalWeight: 60, codeQualityWeight: 20, trajectoryWeight: 20 },
        manifestHash: 'hash-def-456',
        isPublished: true,
        starterFiles: {
          'src/app.ts': 'export const app = 1;',
        },
      });

      const res = await request(app).get('/api/challenges/challenge-starter-01');
      expect(res.status).toBe(200);
      expect(res.body.challenge.id).toBe('challenge-starter-01');
      expect(res.body.starterFiles['src/app.ts']).toBe('export const app = 1;');
    });
  });
});
