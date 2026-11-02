import type { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { TokenService, TokenPayload } from '../services/token.service.js';
import type { UserRole } from '@repodojo/shared';

// Extend Express Request and User to include authenticated user
declare global {
  namespace Express {
    interface User {
      sub?: string;
      email?: string;
      role?: string;
      name?: string;
      avatarUrl?: string;
      [key: string]: any;
    }
    interface Request {
      user?: User;
    }
  }
}

/**
 * Strict Rate Limiter for Authentication Endpoints (PRD §5, §11.4).
 * Limits repeated token requests and login attempts to 10 requests per minute per IP.
 */
export const authRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // max 20 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'TOO_MANY_REQUESTS',
    message: 'Too many authentication attempts. Please try again in 1 minute.',
  },
});

/**
 * Middleware: Requires a valid Access Token JWT (from HTTP-only cookie or Bearer header).
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const cookieToken = req.cookies?.access_token;
  const headerToken = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.substring(7)
    : undefined;

  const token = cookieToken || headerToken;

  if (!token) {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Authentication required. No access token provided.',
    });
    return;
  }

  try {
    const payload = TokenService.verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (err) {
    res.status(401).json({
      error: 'INVALID_TOKEN',
      message: 'Access token is invalid or has expired.',
    });
  }
}

/**
 * Middleware: Requires user to possess one of the allowed roles (RBAC - Decision 3.3).
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Authentication required.',
      });
      return;
    }

    if (!req.user.role || !allowedRoles.includes(req.user.role as UserRole)) {
      res.status(403).json({
        error: 'FORBIDDEN',
        message: `Access denied. Requires one of roles: ${allowedRoles.join(', ')}.`,
      });
      return;
    }

    next();
  };
}
