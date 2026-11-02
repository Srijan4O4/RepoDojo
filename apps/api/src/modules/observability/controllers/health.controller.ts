import net from 'net';
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import type { HealthCheckResponse } from '@repodojo/shared';

const START_TIME = Date.now();
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

async function pingRedis(redisUrl?: string): Promise<{ status: 'up' | 'down'; latencyMs: number }> {
  if (!redisUrl) {
    return {
      status: process.env.NODE_ENV === 'production' ? 'down' : 'up',
      latencyMs: 0,
    };
  }

  const start = Date.now();
  return new Promise((resolve) => {
    try {
      const parsed = new URL(redisUrl);
      const host = parsed.hostname || '127.0.0.1';
      const port = Number(parsed.port) || 6379;
      const socket = net.createConnection({ host, port, timeout: 1000 });

      let answered = false;
      const finish = (status: 'up' | 'down') => {
        if (answered) return;
        answered = true;
        socket.destroy();
        resolve({ status, latencyMs: Date.now() - start });
      };

      socket.on('connect', () => {
        if (parsed.password) {
          socket.write(`AUTH ${parsed.password}\r\nPING\r\n`);
        } else {
          socket.write('PING\r\n');
        }
      });

      socket.on('data', (data) => {
        const text = data.toString();
        if (text.includes('+PONG') || text.includes('+OK')) {
          finish('up');
        } else {
          finish('down');
        }
      });

      socket.on('error', () => finish('down'));
      socket.on('timeout', () => finish('down'));
    } catch {
      resolve({ status: 'down', latencyMs: Date.now() - start });
    }
  });
}

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
    const redisCheck = await pingRedis(process.env.REDIS_URL);
    dependencies.redis = redisCheck;
    if (redisCheck.status === 'down' && process.env.NODE_ENV === 'production') {
      isHealthy = false;
    }

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
