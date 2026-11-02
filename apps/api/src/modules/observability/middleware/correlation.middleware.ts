import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

// Extend Express Request interface with trace & correlation context
declare global {
  namespace Express {
    interface Request {
      traceId?: string;
      spanId?: string;
      correlationId?: string;
      logContext?: Record<string, unknown>;
    }
  }
}

/**
 * Distributed Tracing & Correlation Middleware (ADR-001 Decision 13.1)
 * Enforces W3C Trace Context (`traceparent`) and propagates correlation IDs
 * across Express, Python AI service, BullMQ, and Docker workers.
 */
export function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
  // 1. Parse or Generate W3C Traceparent: 00-{trace_id}-{span_id}-{trace_flags}
  const traceparent = req.headers['traceparent'] as string | undefined;
  let traceId = '';
  let parentSpanId = '';

  if (traceparent && /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/i.test(traceparent)) {
    const parts = traceparent.split('-');
    traceId = parts[1];
    parentSpanId = parts[2];
  } else {
    traceId = crypto.randomBytes(16).toString('hex'); // 32-character hex trace ID
  }

  // Generate current span ID (16-character hex)
  const spanId = crypto.randomBytes(8).toString('hex');

  // 2. Correlation ID (Client-provided or generated)
  const correlationId =
    (req.headers['x-correlation-id'] as string) ||
    (req.headers['x-request-id'] as string) ||
    crypto.randomUUID();

  // 3. Extract Assessment / Session IDs from query, params, or headers
  const sessionId =
    (req.headers['x-session-id'] as string) ||
    (req.params?.sessionId as string) ||
    (req.query?.sessionId as string) ||
    req.body?.sessionId;

  const assessmentId =
    (req.headers['x-assessment-id'] as string) ||
    (req.params?.assessmentId as string) ||
    req.body?.assessmentId;

  // Attach to Request object
  req.traceId = traceId;
  req.spanId = spanId;
  req.correlationId = correlationId;

  req.logContext = {
    traceId,
    spanId,
    parentSpanId: parentSpanId || undefined,
    correlationId,
    sessionId: sessionId || undefined,
    assessmentId: assessmentId || undefined,
    method: req.method,
    path: req.path,
  };

  // Set response headers for client tracking
  res.setHeader('X-Trace-Id', traceId);
  res.setHeader('X-Span-Id', spanId);
  res.setHeader('X-Correlation-Id', correlationId);
  res.setHeader('traceparent', `00-${traceId}-${spanId}-01`);

  next();
}
