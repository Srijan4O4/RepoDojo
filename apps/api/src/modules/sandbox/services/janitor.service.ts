import { SandboxService } from './sandbox.service.js';
import { AssessmentModel } from '../../assessment/models/assessment.model.js';

export class JanitorService {
  /**
   * Reconciles active sandboxes against database session leases (Decision 6.5 & SEC-04).
   * Safely reclaims orphaned or expired sandboxes without broad host prunes.
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

    const allocations = SandboxService.getAllAllocations();
    inspectedCount = allocations.length;

    for (const alloc of allocations) {
      const dbExpiresAt = activeSessionMap.get(alloc.sessionId);
      const isStillActive = activeSessionMap.has(alloc.sessionId);
      const isExpired = alloc.expiresAt && now.getTime() >= alloc.expiresAt.getTime();
      const isDbExpired = dbExpiresAt && now.getTime() >= dbExpiresAt.getTime();

      if (!isStillActive || isExpired || isDbExpired) {
        await SandboxService.terminateSandbox(alloc.sessionId, 'TIMED_OUT');
        reclaimedCount++;
      }
    }

    return { inspectedCount, reclaimedCount };
  }
}
