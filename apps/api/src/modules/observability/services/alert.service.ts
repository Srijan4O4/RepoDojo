/**
 * High-Signal SLO Operational Alerting Service
 * ADR-001 Decision 13.2 / PRD §12.3
 * Monitors and dispatches operational alerts for the 8 core platform failure triggers.
 */

export type AlertType =
  | 'ALERT_SANDBOX_PROVISION_FAILURE'
  | 'ALERT_EVALUATION_QUEUE_BACKLOG'
  | 'ALERT_EVALUATION_DEAD_LETTER'
  | 'ALERT_GEMINI_QUOTA_EXHAUSTED'
  | 'ALERT_JANITOR_ORPHAN_SPIKE'
  | 'ALERT_DATABASE_UNAVAILABLE'
  | 'ALERT_SERVICE_RESTART_LOOP'
  | 'ALERT_WORKER_RESOURCE_EXHAUSTION';

export type AlertSeverity = 'P1_CRITICAL' | 'P2_HIGH' | 'P3_WARNING';

export interface OperationalAlert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  service: string;
  timestamp: string;
  sessionId?: string;
  assessmentId?: string;
  metadata?: Record<string, unknown>;
}

export class AlertService {
  private static readonly RECENT_ALERTS_LIMIT = 100;
  private static recentAlerts: OperationalAlert[] = [];
  private static lastDispatchedTimestamps: Map<string, number> = new Map();
  private static readonly THROTTLE_WINDOW_MS = 60000; // 1-minute deduplication window

  /**
   * Dispatches a high-signal operational alert.
   * Enforces deduplication throttling to prevent alert storms.
   */
  public static async dispatchAlert(params: {
    type: AlertType;
    severity?: AlertSeverity;
    message: string;
    service?: string;
    sessionId?: string;
    assessmentId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<OperationalAlert | null> {
    const {
      type,
      severity = type === 'ALERT_DATABASE_UNAVAILABLE' || type === 'ALERT_EVALUATION_DEAD_LETTER'
        ? 'P1_CRITICAL'
        : 'P2_HIGH',
      message,
      service = '@repodojo/api',
      sessionId,
      assessmentId,
      metadata = {},
    } = params;

    const throttleKey = `${type}:${sessionId || 'global'}`;
    const now = Date.now();
    const lastDispatched = this.lastDispatchedTimestamps.get(throttleKey);

    // Suppress repeated alerts of the same type within the throttle window
    if (lastDispatched && now - lastDispatched < this.THROTTLE_WINDOW_MS) {
      return null;
    }

    this.lastDispatchedTimestamps.set(throttleKey, now);

    const alert: OperationalAlert = {
      id: `alert_${now}_${Math.random().toString(36).substring(2, 7)}`,
      type,
      severity,
      message,
      service,
      timestamp: new Date().toISOString(),
      sessionId,
      assessmentId,
      metadata,
    };

    // Store in circular buffer
    this.recentAlerts.unshift(alert);
    if (this.recentAlerts.length > this.RECENT_ALERTS_LIMIT) {
      this.recentAlerts.pop();
    }

    // Deliver to external webhook if configured
    const webhookUrl = process.env.ALERT_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(alert),
        });
      } catch {
        // Non-blocking webhook failure
      }
    }

    return alert;
  }

  /**
   * Retrieves recorded alerts for health dashboards & diagnostics.
   */
  public static getRecentAlerts(limit = 50): OperationalAlert[] {
    return this.recentAlerts.slice(0, limit);
  }

  /**
   * Clears alerts (for testing reset).
   */
  public static clearAlerts(): void {
    this.recentAlerts = [];
    this.lastDispatchedTimestamps.clear();
  }
}
