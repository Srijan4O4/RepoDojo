import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Response } from 'express';
import { IUser, UserModel } from '../models/user.model.js';
import type { UserRole } from '@repodojo/shared';

export interface TokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

function getAccessTokenSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('CRITICAL CONFIGURATION ERROR: JWT_ACCESS_SECRET must be set in production mode.');
    }
    return 'dev-insecure-access-secret-repodojo-12345';
  }
  return secret;
}

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_DAYS = 7;

export class TokenService {
  /**
   * Hashes a raw refresh token using SHA-256 before database storage.
   */
  public static hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Generates a 15-minute Access Token JWT.
   */
  public static generateAccessToken(user: IUser): string {
    const payload: TokenPayload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
    };
    return jwt.sign(payload, getAccessTokenSecret(), { expiresIn: ACCESS_TOKEN_EXPIRY });
  }

  /**
   * Verifies an Access Token JWT.
   */
  public static verifyAccessToken(token: string): TokenPayload {
    return jwt.verify(token, getAccessTokenSecret()) as TokenPayload;
  }

  /**
   * Generates a cryptographically random Refresh Token and persists its hash in MongoDB.
   */
  public static async createRefreshToken(user: IUser, familyId?: string): Promise<string> {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const family = familyId || crypto.randomUUID();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

    // Prune expired tokens before adding new one
    user.refreshTokens = user.refreshTokens.filter((t) => t.expiresAt > new Date());
    user.refreshTokens.push({
      tokenHash,
      family,
      expiresAt,
      createdAt: new Date(),
    });

    await user.save();
    return rawToken;
  }

  /**
   * Rotates a Refresh Token with automatic token reuse (theft) detection (SEC-07 & RFC 6749).
   */
  public static async rotateRefreshToken(
    rawToken: string,
  ): Promise<{ user: IUser; newAccessToken: string; newRefreshToken: string }> {
    const tokenHash = this.hashToken(rawToken);

    // 1. Token Reuse / Theft Detection:
    // If the presented token was previously rotated and placed in revokedTokenHashes,
    // this indicates an adversary has replayed a captured refresh token.
    const compromisedUser = await UserModel.findOne({ revokedTokenHashes: tokenHash });
    if (compromisedUser) {
      // Invalidate all active tokens for this compromised account immediately
      compromisedUser.refreshTokens = [];
      await compromisedUser.save();
      throw new Error('TOKEN_REUSE_DETECTED');
    }

    // 2. Find user who owns this active token hash
    const user = await UserModel.findOne({ 'refreshTokens.tokenHash': tokenHash });
    if (!user) {
      throw new Error('INVALID_REFRESH_TOKEN');
    }

    const tokenRecord = user.refreshTokens.find((t) => t.tokenHash === tokenHash);
    if (!tokenRecord) {
      throw new Error('INVALID_REFRESH_TOKEN');
    }

    if (tokenRecord.expiresAt < new Date()) {
      // Remove expired token
      user.refreshTokens = user.refreshTokens.filter((t) => t.tokenHash !== tokenHash);
      await user.save();
      throw new Error('REFRESH_TOKEN_EXPIRED');
    }

    const family = tokenRecord.family;

    // 3. Mark old token as revoked for replay detection
    user.refreshTokens = user.refreshTokens.filter((t) => t.tokenHash !== tokenHash);
    if (!user.revokedTokenHashes) {
      user.revokedTokenHashes = [];
    }
    user.revokedTokenHashes.push(tokenHash);

    // Cap history to prevent unbounded growth
    if (user.revokedTokenHashes.length > 20) {
      user.revokedTokenHashes = user.revokedTokenHashes.slice(-20);
    }

    // 4. Issue newly rotated token in the same family
    const newRawRefreshToken = crypto.randomBytes(32).toString('hex');
    const newTokenHash = this.hashToken(newRawRefreshToken);
    const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

    user.refreshTokens.push({
      tokenHash: newTokenHash,
      family,
      expiresAt: newExpiresAt,
      createdAt: new Date(),
    });

    await user.save();

    const newAccessToken = this.generateAccessToken(user);

    return {
      user,
      newAccessToken,
      newRefreshToken: newRawRefreshToken,
    };
  }

  /**
   * Revokes a specific Refresh Token on logout.
   */
  public static async revokeRefreshToken(rawToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    await UserModel.updateOne(
      { 'refreshTokens.tokenHash': tokenHash },
      { $pull: { refreshTokens: { tokenHash } } },
    );
  }

  /**
   * Sets HTTP-only, Secure, SameSite cookies for both tokens.
   */
  public static setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
    const isProduction = process.env.NODE_ENV === 'production';

    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 15 * 60 * 1000, // 15 mins
    });

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000, // 7 days
    });
  }

  /**
   * Clears authentication cookies upon logout.
   */
  public static clearAuthCookies(res: Response): void {
    const isProduction = process.env.NODE_ENV === 'production';

    res.clearCookie('access_token', {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
    });

    res.clearCookie('refresh_token', {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/api/auth',
    });
  }
}
