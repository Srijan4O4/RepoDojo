import path from 'path';
import { fileURLToPath } from 'url';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { app } from '../../../index.js';
import { UserModel } from '../../auth/models/user.model.js';
import { TokenService } from '../../auth/services/token.service.js';
import { AssessmentModel } from '../../assessment/models/assessment.model.js';
import { SandboxService } from '../services/sandbox.service.js';
import { TerminalGatewayService } from '../services/terminal-gateway.service.js';
import { PreviewProxyService } from '../services/preview-proxy.service.js';
import { computeLineDiff } from '../controllers/workspace-file.controller.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'test-secret-sandbox-token-12345';
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
  SandboxService.reset();
});

afterEach(async () => {
  await UserModel.deleteMany({});
  await AssessmentModel.deleteMany({});
});

describe('Domain 6: Sandbox and Execution Infrastructure', () => {
  describe('Sandbox Provisioning & Infrastructure Contract §1', () => {
    it('POST /api/sandboxes/:sessionId/provision should allocate sandbox with bridge IP and ports', async () => {
      const candidate = await UserModel.create({
        email: 'sandbox.cand@repodojo.com',
        name: 'Sandbox Candidate',
        role: 'candidate',
      });
      const token = TokenService.generateAccessToken(candidate);

      const session = await AssessmentModel.create({
        candidateId: candidate._id,
        challengeId: 'node-ecommerce-01',
        status: 'CREATED',
        durationMinutes: 60,
      });

      const res = await request(app)
        .post(`/api/sandboxes/${session._id}/provision`)
        .set('Cookie', [`access_token=${token}`]);

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.sandbox.containerId).toMatch(/^rd_sandbox_/);
      expect(res.body.sandbox.bridgeIp).toMatch(/^172\.28\./);
      expect(res.body.sandbox.ports.frontend).toBe(5173);
      expect(res.body.sandbox.ports.backend).toBe(5000);
      expect(res.body.sandbox.previewUrl).toContain(session._id.toString());

      // Check session updated
      const reloadedSession = await AssessmentModel.findById(session._id);
      expect(reloadedSession?.status).toBe('READY');
      expect(reloadedSession?.containerId).toBe(res.body.sandbox.containerId);
    });

    it('GET /api/sandboxes/:sessionId/status should return cgroup stats', async () => {
      const candidate = await UserModel.create({
        email: 'stats.cand@repodojo.com',
        name: 'Stats Candidate',
        role: 'candidate',
      });
      const token = TokenService.generateAccessToken(candidate);

      const session = await AssessmentModel.create({
        candidateId: candidate._id,
        challengeId: 'node-ecommerce-01',
        status: 'READY',
      });

      await SandboxService.provisionSandbox({
        sessionId: session._id.toString(),
        candidateId: candidate._id.toString(),
        challengeId: 'node-ecommerce-01',
      });

      const res = await request(app)
        .get(`/api/sandboxes/${session._id}/status`)
        .set('Cookie', [`access_token=${token}`]);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.stats.cpuUsagePercent).toBeDefined();
      expect(res.body.stats.ramUsageMb).toBeGreaterThan(0);
      expect(res.body.stats.bridgeIp).toMatch(/^172\.28\./);
    });
  });

  describe('Workspace File Gateway & Security (Decision 6.4)', () => {
    it('GET /api/workspace/:sessionId/tree should return workspace file tree', async () => {
      const candidate = await UserModel.create({
        email: 'file.cand@repodojo.com',
        name: 'File Candidate',
        role: 'candidate',
      });
      const token = TokenService.generateAccessToken(candidate);

      const session = await AssessmentModel.create({
        candidateId: candidate._id,
        challengeId: 'node-ecommerce-01',
        status: 'IN_PROGRESS',
      });

      await SandboxService.provisionSandbox({
        sessionId: session._id.toString(),
        candidateId: candidate._id.toString(),
        challengeId: 'node-ecommerce-01',
        starterFiles: {
          'src/index.ts': 'console.log("starter index");',
          'package.json': '{"name": "demo"}',
        },
      });

      const res = await request(app)
        .get(`/api/workspace/${session._id}/tree`)
        .set('Cookie', [`access_token=${token}`]);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.files.length).toBe(2);
      expect(res.body.files.some((f: any) => f.path === 'src/index.ts')).toBe(true);
    });

    it('Security: Path traversal attempts must be rejected with 400 INVALID_FILE_PATH', async () => {
      const candidate = await UserModel.create({
        email: 'hacker.cand@repodojo.com',
        name: 'Hacker Candidate',
        role: 'candidate',
      });
      const token = TokenService.generateAccessToken(candidate);

      const session = await AssessmentModel.create({
        candidateId: candidate._id,
        challengeId: 'node-ecommerce-01',
        status: 'IN_PROGRESS',
      });

      await SandboxService.provisionSandbox({
        sessionId: session._id.toString(),
        candidateId: candidate._id.toString(),
        challengeId: 'node-ecommerce-01',
      });

      // Path traversal read
      const readRes = await request(app)
        .get(`/api/workspace/${session._id}/file?path=../../etc/passwd`)
        .set('Cookie', [`access_token=${token}`]);
      expect(readRes.status).toBe(400);
      expect(readRes.body.error).toBe('INVALID_FILE_PATH');

      // Path traversal write
      const writeRes = await request(app)
        .put(`/api/workspace/${session._id}/file`)
        .set('Cookie', [`access_token=${token}`])
        .send({ path: '../../../root/shadow', content: 'malicious' });
      expect(writeRes.status).toBe(400);
      expect(writeRes.body.error).toBe('INVALID_FILE_PATH');
    });

    it('PUT /api/workspace/:sessionId/file should save file and increment revision', async () => {
      const candidate = await UserModel.create({
        email: 'write.cand@repodojo.com',
        name: 'Write Candidate',
        role: 'candidate',
      });
      const token = TokenService.generateAccessToken(candidate);

      const session = await AssessmentModel.create({
        candidateId: candidate._id,
        challengeId: 'node-ecommerce-01',
        status: 'IN_PROGRESS',
        workspaceRevision: 0,
      });

      await SandboxService.provisionSandbox({
        sessionId: session._id.toString(),
        candidateId: candidate._id.toString(),
        challengeId: 'node-ecommerce-01',
        starterFiles: {
          'src/app.ts': 'const original = 1;\n',
        },
      });

      const res = await request(app)
        .put(`/api/workspace/${session._id}/file`)
        .set('Cookie', [`access_token=${token}`])
        .send({
          path: 'src/app.ts',
          content: 'const original = 1;\nconst modified = 2;\n',
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.isModified).toBe(true);

      // Verify DB revision incremented
      const reloadedSession = await AssessmentModel.findById(session._id);
      expect(reloadedSession?.workspaceRevision).toBe(1);
    });

    it('GET /api/workspace/:sessionId/diff should return additions and deletions', async () => {
      const candidate = await UserModel.create({
        email: 'diff.cand@repodojo.com',
        name: 'Diff Candidate',
        role: 'candidate',
      });
      const token = TokenService.generateAccessToken(candidate);

      const session = await AssessmentModel.create({
        candidateId: candidate._id,
        challengeId: 'node-ecommerce-01',
        status: 'IN_PROGRESS',
      });

      await SandboxService.provisionSandbox({
        sessionId: session._id.toString(),
        candidateId: candidate._id.toString(),
        challengeId: 'node-ecommerce-01',
        starterFiles: {
          'src/app.ts': 'line1\nline2\n',
        },
      });

      // Modify the file
      await request(app)
        .put(`/api/workspace/${session._id}/file`)
        .set('Cookie', [`access_token=${token}`])
        .send({
          path: 'src/app.ts',
          content: 'line1\nmodified_line2\nline3_added\n',
        });

      const diffRes = await request(app)
        .get(`/api/workspace/${session._id}/diff`)
        .set('Cookie', [`access_token=${token}`]);

      expect(diffRes.status).toBe(200);
      expect(diffRes.body.count).toBe(1);
      expect(diffRes.body.diffs[0].path).toBe('src/app.ts');
      expect(diffRes.body.diffs[0].additions).toBeGreaterThan(0);
    });
  });

  describe('Terminal Gateway & Preview Proxy (Decision 6.2 & 6.3)', () => {
    it('TerminalGatewayService should maintain circular replay buffer', () => {
      const sessionId = 'test-term-sess-01';
      TerminalGatewayService.appendOutput(sessionId, 'test log output line 1\r\n');
      TerminalGatewayService.appendOutput(sessionId, 'test log output line 2\r\n');

      const replay = TerminalGatewayService.getReplayOutput(sessionId);
      expect(replay).toContain('test log output line 1');
      expect(replay).toContain('test log output line 2');
    });

    it('PreviewProxyService should generate valid Caddy reverse proxy routing rules', () => {
      const config = PreviewProxyService.generateRouteConfig('sess-abc-123', '172.28.1.10');
      expect(config.subdomain).toBe('sess-abc-123.preview.repodojo-preview.net');
      expect(config.frontendTarget).toBe('http://172.28.1.10:5173');
      expect(config.backendTarget).toBe('http://172.28.1.10:5000');
      expect(config.caddySnippet).toContain('reverse_proxy http://172.28.1.10:5173');
      expect(config.caddySnippet).toContain('reverse_proxy http://172.28.1.10:5000');
    });
  });
  describe('SEC-02: Cross-Candidate Sandbox Authorization & Lifecycle Immutability', () => {
    let candidateA: any;
    let candidateB: any;
    let adminUser: any;
    let tokenA: string;
    let tokenB: string;
    let adminToken: string;
    let sessionB: any;

    beforeEach(async () => {
      candidateA = await UserModel.create({
        email: 'candA@repodojo.com',
        name: 'Candidate A',
        role: 'candidate',
      });
      tokenA = TokenService.generateAccessToken(candidateA);

      candidateB = await UserModel.create({
        email: 'candB@repodojo.com',
        name: 'Candidate B',
        role: 'candidate',
      });
      tokenB = TokenService.generateAccessToken(candidateB);

      adminUser = await UserModel.create({
        email: 'admin@repodojo.com',
        name: 'Admin User',
        role: 'admin',
      });
      adminToken = TokenService.generateAccessToken(adminUser);

      sessionB = await AssessmentModel.create({
        candidateId: candidateB._id,
        challengeId: 'node-ecommerce-01',
        status: 'READY',
        durationMinutes: 60,
      });

      await SandboxService.provisionSandbox({
        sessionId: sessionB._id.toString(),
        candidateId: candidateB._id.toString(),
        challengeId: 'node-ecommerce-01',
        starterFiles: {
          'src/index.ts': 'console.log("starter");\n\nreturn;\n',
        },
      });
    });

    it('should reject candidate A attempting to provision candidate B session with 403', async () => {
      const res = await request(app)
        .post(`/api/sandboxes/${sessionB._id}/provision`)
        .set('Cookie', [`access_token=${tokenA}`]);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
    });

    it('should reject candidate A attempting to read candidate B sandbox status with 403', async () => {
      const res = await request(app)
        .get(`/api/sandboxes/${sessionB._id}/status`)
        .set('Cookie', [`access_token=${tokenA}`]);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
    });

    it('should reject candidate A attempting to read candidate B workspace tree with 403', async () => {
      const res = await request(app)
        .get(`/api/workspace/${sessionB._id}/tree`)
        .set('Cookie', [`access_token=${tokenA}`]);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
    });

    it('should reject candidate A attempting to read candidate B file with 403', async () => {
      const res = await request(app)
        .get(`/api/workspace/${sessionB._id}/file?path=src/index.ts`)
        .set('Cookie', [`access_token=${tokenA}`]);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
    });

    it('should reject candidate A attempting to edit candidate B file with 403', async () => {
      const res = await request(app)
        .put(`/api/workspace/${sessionB._id}/file`)
        .set('Cookie', [`access_token=${tokenA}`])
        .send({ path: 'src/index.ts', content: 'hacked' });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
    });

    it('should reject candidate A attempting to replay candidate B terminal with 403', async () => {
      const res = await request(app)
        .get(`/api/sandboxes/${sessionB._id}/terminal/replay`)
        .set('Cookie', [`access_token=${tokenA}`]);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
    });

    it('should reject candidate A attempting to terminate candidate B sandbox with 403', async () => {
      const res = await request(app)
        .post(`/api/sandboxes/${sessionB._id}/terminate`)
        .set('Cookie', [`access_token=${tokenA}`]);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
    });

    it('should allow admin to access candidate B session with 200', async () => {
      const res = await request(app)
        .get(`/api/workspace/${sessionB._id}/tree`)
        .set('Cookie', [`access_token=${adminToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.files).toBeDefined();
    });

    it('should reject file mutations with 409 when session is COMPLETED (lifecycle immutability)', async () => {
      sessionB.status = 'COMPLETED';
      await sessionB.save();

      const res = await request(app)
        .put(`/api/workspace/${sessionB._id}/file`)
        .set('Cookie', [`access_token=${tokenB}`])
        .send({ path: 'src/index.ts', content: 'late modification' });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('SESSION_IMMUTABLE');
    });

    it('should accurately compute LCS diff additions and deletions without collapsing duplicate lines', () => {
      // Add 3 new empty lines to the file
      const original = 'line1\n\nline2\n';
      const modified = 'line1\n\n\n\n\nline2\n'; // 3 more empty lines added

      const diff = computeLineDiff(original, modified);
      expect(diff.additions).toBe(3);
      expect(diff.deletions).toBe(0);
    });
  });
});
