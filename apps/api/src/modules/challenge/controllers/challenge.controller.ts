import type { Request, Response } from 'express';
import { ChallengeModel } from '../models/challenge.model.js';
import { ChallengeValidatorService } from '../services/challenge-validator.service.js';

export class ChallengeController {
  /**
   * GET /api/challenges
   * Lists all published assessment challenges.
   */
  public static async listChallenges(_req: Request, res: Response): Promise<void> {
    try {
      const challenges = await ChallengeModel.find({ isPublished: true }).select('-starterFiles -__v');
      res.status(200).json({
        status: 'success',
        count: challenges.length,
        challenges: challenges.map((c) => c.toManifest()),
      });
    } catch (err: any) {
      res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message });
    }
  }

  /**
   * GET /api/challenges/:id
   * Retrieves full challenge details and starter manifest.
   */
  public static async getChallengeById(req: Request, res: Response): Promise<void> {
    const id = String(req.params.id);

    try {
      const challenge = await ChallengeModel.findOne({ id, isPublished: true });

      if (!challenge) {
        res.status(404).json({ error: 'CHALLENGE_NOT_FOUND', message: `Challenge "${id}" not found.` });
        return;
      }

      res.status(200).json({
        status: 'success',
        challenge: challenge.toManifest(),
        starterFiles: challenge.starterFiles || {},
      });
    } catch (err: any) {
      res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message });
    }
  }

  /**
   * POST /api/challenges/sync
   * Validates and upserts authoritative challenge manifest into MongoDB projection (Decision 5.2).
   * Restricted to admin role.
   */
  public static async syncChallenge(req: Request, res: Response): Promise<void> {
    const { yamlContent, starterFiles } = req.body;

    if (!yamlContent) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'yamlContent is required.' });
      return;
    }

    const validation = ChallengeValidatorService.validateYaml(yamlContent);
    if (!validation.valid || !validation.manifest || !validation.manifestHash) {
      res.status(422).json({
        error: 'MANIFEST_VALIDATION_FAILED',
        errors: validation.errors,
      });
      return;
    }

    try {
      const { manifest, manifestHash } = validation;

      const challenge = await ChallengeModel.findOneAndUpdate(
        { id: manifest.id },
        {
          $set: {
            title: manifest.title,
            version: manifest.version,
            description: manifest.description,
            difficulty: manifest.difficulty,
            durationMinutes: manifest.durationMinutes,
            runtime: manifest.runtime,
            defects: manifest.defects,
            rubrics: manifest.rubrics,
            manifestHash,
            isPublished: true,
            starterFiles: starterFiles || {},
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      res.status(200).json({
        status: 'success',
        message: `Challenge "${manifest.id}" synchronized and published successfully.`,
        challenge: challenge.toManifest(),
      });
    } catch (err: any) {
      res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message });
    }
  }
}
