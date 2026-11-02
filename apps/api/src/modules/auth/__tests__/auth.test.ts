import path from 'path';
import { fileURLToPath } from 'url';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { app } from '../../../index.js';
import { UserModel, IUser } from '../models/user.model.js';
import { TokenService } from '../services/token.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'test-secret-access-token-key-12345';
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
});

describe('Domain 3: Authentication & User Management', () => {
  describe('TokenService Unit Tests', () => {
    it('should generate a valid JWT access token and verify its payload', async () => {
      const user = await UserModel.create({
        email: 'candidate@test.com',
        name: 'Ada Lovelace',
        role: 'candidate',
      });

      const token = TokenService.generateAccessToken(user);
      expect(typeof token).toBe('string');

      const payload = TokenService.verifyAccessToken(token);
      expect(payload.sub).toBe(user._id.toString());
      expect(payload.email).toBe('candidate@test.com');
      expect(payload.role).toBe('candidate');
    });

    it('should create and store a hashed refresh token in the user record', async () => {
      const user = await UserModel.create({
        email: 'developer@test.com',
        name: 'Alan Turing',
        role: 'candidate',
      });

      const rawRefreshToken = await TokenService.createRefreshToken(user);
      expect(typeof rawRefreshToken).toBe('string');
      expect(rawRefreshToken.length).toBe(64); // 32 bytes in hex

      const updatedUser = await UserModel.findById(user._id);
      expect(updatedUser?.refreshTokens.length).toBe(1);
      expect(updatedUser?.refreshTokens[0].tokenHash).toBe(TokenService.hashToken(rawRefreshToken));
    });

    it('should rotate refresh token and issue new access & refresh tokens', async () => {
      const user = await UserModel.create({
        email: 'grace@test.com',
        name: 'Grace Hopper',
        role: 'candidate',
      });

      const initialRefreshToken = await TokenService.createRefreshToken(user);
      const result = await TokenService.rotateRefreshToken(initialRefreshToken);

      expect(result.newAccessToken).toBeDefined();
      expect(result.newRefreshToken).toBeDefined();
      expect(result.newRefreshToken).not.toBe(initialRefreshToken);

      // Verify that old token is no longer valid in database
      const reloadedUser = await UserModel.findById(user._id);
      const oldTokenExists = reloadedUser?.refreshTokens.some(
        (t) => t.tokenHash === TokenService.hashToken(initialRefreshToken),
      );
      expect(oldTokenExists).toBe(false);

      // Verify that new token is stored
      const newTokenExists = reloadedUser?.refreshTokens.some(
        (t) => t.tokenHash === TokenService.hashToken(result.newRefreshToken),
      );
      expect(newTokenExists).toBe(true);
    });

    it('should reject rotation attempt when using an invalid or already rotated token', async () => {
      await expect(TokenService.rotateRefreshToken('non-existent-token-hex')).rejects.toThrow(
        'INVALID_REFRESH_TOKEN',
      );
    });
  });

  describe('Auth Endpoints & Middleware Integration Tests', () => {
    it('GET /api/auth/me should return 401 when unauthenticated', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('UNAUTHORIZED');
    });

    it('GET /api/auth/me should return candidate profile when authenticated with cookie', async () => {
      const user = await UserModel.create({
        email: 'candidate1@repodojo.com',
        name: 'Test Candidate',
        role: 'candidate',
      });

      const accessToken = TokenService.generateAccessToken(user);

      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', [`access_token=${accessToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe('candidate1@repodojo.com');
      expect(res.body.user.role).toBe('candidate');
    });

    it('GET /api/auth/admin/verify should enforce RBAC (Decision 3.3)', async () => {
      const candidateUser = await UserModel.create({
        email: 'candidate@repodojo.com',
        name: 'Normal Candidate',
        role: 'candidate',
      });

      const adminUser = await UserModel.create({
        email: 'admin@repodojo.com',
        name: 'Platform Admin',
        role: 'admin',
      });

      const candidateToken = TokenService.generateAccessToken(candidateUser);
      const adminToken = TokenService.generateAccessToken(adminUser);

      // Candidate should receive 403 Forbidden
      const candidateRes = await request(app)
        .get('/api/auth/admin/verify')
        .set('Cookie', [`access_token=${candidateToken}`]);
      expect(candidateRes.status).toBe(403);
      expect(candidateRes.body.error).toBe('FORBIDDEN');

      // Admin should receive 200 OK
      const adminRes = await request(app)
        .get('/api/auth/admin/verify')
        .set('Cookie', [`access_token=${adminToken}`]);
      expect(adminRes.status).toBe(200);
      expect(adminRes.body.status).toBe('success');
    });

    it('POST /api/auth/refresh should rotate cookies successfully', async () => {
      const user = await UserModel.create({
        email: 'refresh.test@repodojo.com',
        name: 'Refresh Tester',
        role: 'candidate',
      });

      const rawRefreshToken = await TokenService.createRefreshToken(user);

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [`refresh_token=${rawRefreshToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');

      // Check that response set new cookies
      const rawCookies = res.headers['set-cookie'];
      const cookies = Array.isArray(rawCookies) ? rawCookies : rawCookies ? [rawCookies] : [];
      expect(cookies.length).toBeGreaterThan(0);
      const hasAccessToken = cookies.some((c: string) => c.includes('access_token='));
      const hasRefreshToken = cookies.some((c: string) => c.includes('refresh_token='));
      expect(hasAccessToken).toBe(true);
      expect(hasRefreshToken).toBe(true);
    });

    it('POST /api/auth/logout should revoke token and clear cookies', async () => {
      const user = await UserModel.create({
        email: 'logout.test@repodojo.com',
        name: 'Logout Tester',
        role: 'candidate',
      });

      const rawRefreshToken = await TokenService.createRefreshToken(user);

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', [`refresh_token=${rawRefreshToken}`]);

      expect(res.status).toBe(200);

      // Verify token revoked in database
      const reloadedUser = await UserModel.findById(user._id);
      expect(reloadedUser?.refreshTokens.length).toBe(0);

      // Verify cookies cleared
      const rawCookies = res.headers['set-cookie'];
      const cookies = Array.isArray(rawCookies) ? rawCookies : rawCookies ? [rawCookies] : [];
      expect(cookies.length).toBeGreaterThan(0);
      const accessCleared = cookies.some((c: string) => c.includes('access_token=;'));
      const refreshCleared = cookies.some((c: string) => c.includes('refresh_token=;'));
      expect(accessCleared).toBe(true);
      expect(refreshCleared).toBe(true);
    });
  });
});
