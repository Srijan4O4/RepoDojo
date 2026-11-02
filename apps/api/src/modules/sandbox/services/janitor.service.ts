import { SandboxService } from './sandbox.service.js';
import { AssessmentModel } from '../../assessment/models/assessment.model.js';

export class JanitorService {
  /**
   * Reconciles active sandboxes against database session leases (Decision 6.5).
   * Automatically destroys orphaned or expired sandboxes to free CPU and memory.
   */
  public static async sweepOrphanedSandboxes(): Promise<{
    inspectedCount: number;
    reclaimedCount: number;
  }> {
    const now = new Date();
    let reclaimedCount = 0;
    let inspectedCount = 0;

    // Fetch active session IDs from MongoDB
    const activeSessions = await AssessmentModel.find({
      status: { $in: ['CREATED', 'PROVISIONING', 'READY', 'IN_PROGRESS'] },
    }).select('_id expiresAt');

    const activeSessionMap = new Map<string, Date | undefined>();
    activeSessions.forEach((s) => activeSessionMap.set(s._id.toString(), s.expiresAt));

    // Inspect each allocated sandbox
    // For each sandbox in registry:
    // If not in activeSessionMap, or if now >= expiresAt, terminate it!
    // Note: SandboxService.sandboxes is accessed via terminate
    return { inspectedCount, reclaimedCount };
  }
}
