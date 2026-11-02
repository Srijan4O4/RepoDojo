import { Router } from 'express';
import passport from 'passport';
import { AuthController } from '../controllers/auth.controller.js';
import { requireAuth, requireRole, authRateLimiter } from '../middleware/auth.middleware.js';

export const authRouter = Router();

// Google OAuth 2.0 Initiation
authRouter.get(
  '/google',
  authRateLimiter,
  passport.authenticate('google', { scope: ['profile', 'email'], session: false }),
);

// Google OAuth 2.0 Callback
authRouter.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login?error=failed' }),
  AuthController.googleCallback,
);

// Refresh Token Rotation (Decision 3.2)
authRouter.post('/refresh', authRateLimiter, AuthController.refreshToken);

// Logout and Revocation
authRouter.post('/logout', AuthController.logout);

// Current User Profile
authRouter.get('/me', requireAuth, AuthController.getMe);

// Admin-Only Demonstration Route (Decision 3.3 RBAC)
authRouter.get('/admin/verify', requireAuth, requireRole('admin'), (_req, res) => {
  res.status(200).json({ status: 'success', message: 'Admin role verified.' });
});
