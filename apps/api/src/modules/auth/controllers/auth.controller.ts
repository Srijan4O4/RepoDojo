import type { Request, Response } from 'express';
import { TokenService, TokenPayload } from '../services/token.service.js';
import { UserModel, IUser } from '../models/user.model.js';

export class AuthController {
  /**
   * Completes Google OAuth login, issues dual tokens, and redirects to client.
   */
  public static async googleCallback(req: Request, res: Response): Promise<void> {
    const user = req.user as unknown as IUser;
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

    if (!user) {
      res.redirect(`${clientUrl}/login?error=authentication_failed`);
      return;
    }

    try {
      const accessToken = TokenService.generateAccessToken(user);
      const refreshToken = await TokenService.createRefreshToken(user);

      TokenService.setAuthCookies(res, accessToken, refreshToken);
      res.redirect(`${clientUrl}/workspace`);
    } catch (err) {
      res.redirect(`${clientUrl}/login?error=token_generation_failed`);
    }
  }

  /**
   * Rotates a Refresh Token to issue a new Access Token & Refresh Token pair.
   */
  public static async refreshToken(req: Request, res: Response): Promise<void> {
    const rawRefreshToken = req.cookies?.refresh_token;

    if (!rawRefreshToken) {
      res.status(401).json({
        error: 'NO_REFRESH_TOKEN',
        message: 'Refresh token cookie is missing.',
      });
      return;
    }

    try {
      const { newAccessToken, newRefreshToken } =
        await TokenService.rotateRefreshToken(rawRefreshToken);
      TokenService.setAuthCookies(res, newAccessToken, newRefreshToken);

      res.status(200).json({
        status: 'success',
        message: 'Tokens rotated successfully.',
      });
    } catch (err: any) {
      TokenService.clearAuthCookies(res);

      if (err.message === 'TOKEN_REUSE_DETECTED') {
        res.status(401).json({
          error: 'TOKEN_REUSE_DETECTED',
          message: 'Refresh token reuse detected. All active sessions have been terminated.',
        });
        return;
      }

      if (err.message === 'REFRESH_TOKEN_EXPIRED') {
        res.status(401).json({
          error: 'TOKEN_EXPIRED',
          message: 'Refresh token has expired. Please sign in again.',
        });
        return;
      }

      res.status(401).json({
        error: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid refresh token or token reuse detected.',
      });
    }
  }

  /**
   * Logs out candidate, revokes refresh token in MongoDB, and clears cookies.
   */
  public static async logout(req: Request, res: Response): Promise<void> {
    const rawRefreshToken = req.cookies?.refresh_token;

    if (rawRefreshToken) {
      await TokenService.revokeRefreshToken(rawRefreshToken);
    }

    TokenService.clearAuthCookies(res);

    res.status(200).json({
      status: 'success',
      message: 'Logged out successfully.',
    });
  }

  /**
   * Returns current authenticated user profile.
   */
  public static async getMe(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'UNAUTHORIZED' });
      return;
    }

    const payload = req.user as unknown as TokenPayload;
    const user = await UserModel.findById(payload.sub).select('-refreshTokens -__v');

    if (!user) {
      res.status(404).json({
        error: 'USER_NOT_FOUND',
        message: 'User account not found.',
      });
      return;
    }

    res.status(200).json({
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  }
}
