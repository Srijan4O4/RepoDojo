import mongoose, { Schema, Document, Model } from 'mongoose';
import type { ChallengeManifest, DefectDefinition } from '@repodojo/shared';

export interface IChallenge extends Document {
  id: string; // Slug, e.g. "node-ecommerce-01"
  title: string;
  version: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  durationMinutes: number;
  runtime: {
    language: 'nodejs';
    nodeVersion: string;
    ports: {
      frontend: number;
      backend: number;
    };
  };
  defects: DefectDefinition[]; // Exactly 8 defects (Decision 5.2)
  rubrics: {
    functionalWeight: number; // 60
    codeQualityWeight: number; // 20
    trajectoryWeight: number; // 20
  };
  manifestHash: string; // SHA-256 digest
  isPublished: boolean;
  starterFiles: Record<string, string>; // path -> content
  createdAt: Date;
  updatedAt: Date;
  toManifest(): ChallengeManifest;
}

const defectSchema = new Schema<DefectDefinition>(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    affectedFiles: [{ type: String, required: true }],
    prerequisites: [{ type: String, default: [] }],
    points: { type: Number, required: true, default: 6 },
  },
  { _id: false }
);

const challengeSchema = new Schema<IChallenge>(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    version: {
      type: String,
      required: true,
      default: 'v1.0.0',
    },
    description: {
      type: String,
      required: true,
    },
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard'],
      required: true,
      default: 'medium',
    },
    durationMinutes: {
      type: Number,
      required: true,
      default: 60,
    },
    runtime: {
      language: {
        type: String,
        enum: ['nodejs'],
        default: 'nodejs',
        required: true,
      },
      nodeVersion: {
        type: String,
        default: '22',
        required: true,
      },
      ports: {
        frontend: { type: Number, default: 5173 },
        backend: { type: Number, default: 5000 },
      },
    },
    defects: {
      type: [defectSchema],
      required: true,
      validate: [
        (val: DefectDefinition[]) => val.length === 8,
        'Assessment challenges must contain exactly 8 defects (Decision 5.2).',
      ],
    },
    rubrics: {
      functionalWeight: { type: Number, default: 60 },
      codeQualityWeight: { type: Number, default: 20 },
      trajectoryWeight: { type: Number, default: 20 },
    },
    manifestHash: {
      type: String,
      required: true,
    },
    isPublished: {
      type: Boolean,
      default: true,
      index: true,
    },
    starterFiles: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

challengeSchema.methods.toManifest = function (): ChallengeManifest {
  return {
    id: this.id,
    title: this.title,
    version: this.version,
    description: this.description,
    difficulty: this.difficulty,
    durationMinutes: this.durationMinutes,
    runtime: this.runtime,
    defects: this.defects,
    rubrics: this.rubrics,
  };
};

export const ChallengeModel: Model<IChallenge> =
  mongoose.models.Challenge || mongoose.model<IChallenge>('Challenge', challengeSchema);
