import mongoose, { Document, Model, Schema } from 'mongoose';
import type { UserRole } from '@repodojo/shared';

export interface IRefreshToken {
  tokenHash: string;
  family: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface IUser extends Document {
  googleId?: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: UserRole;
  refreshTokens: IRefreshToken[];
  revokedTokenHashes?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const RefreshTokenSchema = new Schema<IRefreshToken>(
  {
    tokenHash: { type: String, required: true, index: true },
    family: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const UserSchema = new Schema<IUser>(
  {
    googleId: { type: String, unique: true, sparse: true, index: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    avatarUrl: { type: String },
    role: { type: String, enum: ['candidate', 'admin'], default: 'candidate', required: true },
    refreshTokens: [RefreshTokenSchema],
    revokedTokenHashes: [{ type: String, index: true }],
  },
  {
    timestamps: true,
  },
);

export const UserModel: Model<IUser> = mongoose.model<IUser>('User', UserSchema);
