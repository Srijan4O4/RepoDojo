import passport from 'passport';
import { Strategy as GoogleStrategy, Profile, VerifyCallback } from 'passport-google-oauth20';
import { UserModel } from '../models/user.model.js';

export function configurePassport(): void {
  const clientID = process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  const callbackURL = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/api/auth/google/callback';

  if (!clientID || !clientSecret) {
    // In test or initial dev environments without Google API credentials, log warning but do not crash.
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID,
        clientSecret,
        callbackURL,
        scope: ['profile', 'email'],
      },
      async (_accessToken: string, _refreshToken: string, profile: Profile, done: VerifyCallback) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) {
            return done(new Error('GOOGLE_AUTH_NO_EMAIL'));
          }

          const name = profile.displayName || email.split('@')[0];
          const avatarUrl = profile.photos?.[0]?.value;
          const googleId = profile.id;

          // Find or create user
          let user = await UserModel.findOne({
            $or: [{ googleId }, { email: email.toLowerCase() }],
          });

          if (!user) {
            user = await UserModel.create({
              googleId,
              email: email.toLowerCase(),
              name,
              avatarUrl,
              role: 'candidate',
              refreshTokens: [],
            });
          } else if (!user.googleId) {
            // Link existing user to Google ID
            user.googleId = googleId;
            if (avatarUrl && !user.avatarUrl) user.avatarUrl = avatarUrl;
            await user.save();
          }

          return done(null, user);
        } catch (err) {
          return done(err as Error);
        }
      },
    ),
  );
}
