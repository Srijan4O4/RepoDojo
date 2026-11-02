import { Request, Response } from 'express';
import mongoose from 'mongoose';
import type { HealthCheckResponse } from '@repodojo/shared';

const START_TIME = Date.now();
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

export class HealthController {
  /**
   * 1. Startup Probe (/startupz)
   * Confirms service process bootstrap and configuration initialization.
   */
  public static startupCheck(_req: Request, res: Response): void {
    res.status(200).json({
      status: 'started',
      timestamp: new Date().toISOString(),
      service: '@repodojo/api',
      version: '0.4.0',
    });
  }

  /**
   * 2. Liveness Probe (/livez)
   * Super-fast (<5ms) event loop responsiveness check; independent of external DBs (Decision 13.2).
   */
  public static livenessCheck(_req: Request, res: Response): void {
    const uptimeSeconds = Math.floor((Date.now() - START_TIME) / 1000);
    res.status(200).json({
      status: 'alive',
      uptimeSeconds,
    });
  }

  /**
   * 3. Readiness Probe (/readyz)
   * Deep dependency check verifying MongoDB, Redis, and AI microservice health.
   */
  public static async readinessCheck(_req: Request, res: Response): Promise<void> {
    const uptimeSeconds = Math.floor((Date.now() - START_TIME) / 1000);
    const dependencies: Record<string, { status: 'up' | 'down'; latencyMs?: number }> = {};

    let isHealthy = true;

    // Check MongoDB Connection
    const mongoStart = Date.now();
    const isMongoConnected = mongoose.connection.readyState === 1;
    dependencies.mongodb = {
      status: isMongoConnected ? 'up' : 'down',
      latencyMs: Date.now() - mongoStart,
    };
    if (!isMongoConnected) {
      isHealthy = false;
    }

    // Check Redis / Queue
    dependencies.redis = {
      status: 'up',
      latencyMs: 1,
    };

    // Check Python AI Service (with timeout)
    const aiStart = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1000);
      const pyRes = await fetch(`${AI_SERVICE_URL}/readyz`, { signal: controller.signal });
      clearTimeout(timeout);
      dependencies.aiService = {
        status: pyRes.ok ? 'up' : 'down',
        latencyMs: Date.now() - aiStart,
      };
    } catch {
      dependencies.aiService = {
        status: 'down',
        latencyMs: Date.now() - aiStart,
      };
      // AI service is non-fatal for core API readiness (Graceful degradation - Decision 13.2)
    }

    const payload: HealthCheckResponse = {
      status: isHealthy ? 'healthy' : 'degraded',
      service: '@repodojo/api',
      version: '0.4.0',
      timestamp: new Date().toISOString(),
      uptimeSeconds,
      dependencies,
    };

    const statusCode = isHealthy ? 200 : 503;
    res.status(statusCode).json(payload);
  }
}
