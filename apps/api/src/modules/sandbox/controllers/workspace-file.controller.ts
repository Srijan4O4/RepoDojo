import type { Request, Response } from 'express';
import { SandboxService } from '../services/sandbox.service.js';
import { AssessmentModel } from '../../assessment/models/assessment.model.js';

/**
 * Computes exact line additions and deletions using Longest Common Subsequence (LCS).
 * Accurately accounts for duplicate lines (e.g. empty lines, brackets) without Set deduplication.
 */
export function computeLineDiff(original: string, modified: string): { additions: number; deletions: number } {
  if (original === modified) {
    return { additions: 0, deletions: 0 };
  }

  const origLines = original.split('\n');
  const modLines = modified.split('\n');
  const m = origLines.length;
  const n = modLines.length;

  let prev = new Int32Array(n + 1);
  let curr = new Int32Array(n + 1);

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (origLines[i - 1] === modLines[j - 1]) {
        curr[j] = prev[j - 1] + 1;
      } else {
        curr[j] = Math.max(prev[j], curr[j - 1]);
      }
    }
    prev.set(curr);
  }

  const lcsLength = curr[n];
  return {
    deletions: m - lcsLength,
    additions: n - lcsLength,
  };
}

export class WorkspaceFileController {
  /**
   * Sanitizes and validates workspace file path against directory traversal attacks.
   */
  public static sanitizePath(rawPath: string): string | null {
    if (!rawPath || typeof rawPath !== 'string') return null;
    const normalized = rawPath.replace(/\\/g, '/').trim();
    if (normalized.includes('..') || normalized.startsWith('/') || normalized.startsWith('./')) {
      return null;
    }
    return normalized;
  }

  /**
   * Verifies session authorization and lifecycle state.
   */
  private static async verifyAccess(req: Request, sessionId: string, requireActive = false) {
    let session = req.assessmentSession;
    if (!session) {
      session = (await AssessmentModel.findById(sessionId)) || undefined;
    }

    if (!session) return { error: 'SESSION_NOT_FOUND', status: 404 };

    const candidateId = req.user?.sub || req.user?.id || req.user?._id;
    const role = req.user?.role;

    if (session.candidateId.toString() !== candidateId?.toString() && role !== 'admin') {
      return { error: 'FORBIDDEN', status: 403 };
    }

    if (requireActive) {
      const activeStates = ['CREATED', 'PROVISIONING', 'READY', 'IN_PROGRESS'];
      if (!activeStates.includes(session.status)) {
        return {
          error: 'SESSION_IMMUTABLE',
          status: 409,
          message: `Assessment session is in '${session.status}' state and workspace is frozen.`,
        };
      }
    }

    return { session };
  }

  /**
   * GET /api/workspace/:sessionId/tree
   * Lists all files in the candidate sandbox workspace.
   */
  public static async getFileTree(req: Request, res: Response): Promise<void> {
    const sessionId = String(req.params.sessionId);
    const auth = await WorkspaceFileController.verifyAccess(req, sessionId);
    if (auth.error) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    const sandbox = SandboxService.getSandbox(sessionId);
    if (!sandbox) {
      res.status(404).json({ error: 'SANDBOX_NOT_PROVISIONED', message: 'Sandbox not found.' });
      return;
    }

    const files = Array.from(sandbox.files.entries()).map(([path, file]) => ({
      path,
      name: path.split('/').pop() || path,
      isModified: file.content !== file.originalContent,
      revision: file.revision,
    }));

    res.status(200).json({ status: 'success', files });
  }

  /**
   * GET /api/workspace/:sessionId/file?path=...
   * Retrieves single file content.
   */
  public static async getFile(req: Request, res: Response): Promise<void> {
    const sessionId = String(req.params.sessionId);
    const auth = await WorkspaceFileController.verifyAccess(req, sessionId);
    if (auth.error) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    const rawPath = req.query.path as string;
    const filePath = WorkspaceFileController.sanitizePath(rawPath);
    if (!filePath) {
      res.status(400).json({ error: 'INVALID_FILE_PATH', message: 'Path traversal or invalid path detected.' });
      return;
    }

    const sandbox = SandboxService.getSandbox(sessionId);
    if (!sandbox) {
      res.status(404).json({ error: 'SANDBOX_NOT_PROVISIONED' });
      return;
    }

    const file = sandbox.files.get(filePath);
    if (!file) {
      res.status(404).json({ error: 'FILE_NOT_FOUND', message: `File "${filePath}" does not exist.` });
      return;
    }

    res.status(200).json({
      status: 'success',
      path: filePath,
      content: file.content,
      isModified: file.content !== file.originalContent,
      revision: file.revision,
    });
  }

  /**
   * PUT /api/workspace/:sessionId/file
   * Saves updated file content into sandbox disk and increments workspace revision.
   * Rejects if session is frozen or completed (SEC-02).
   */
  public static async saveFile(req: Request, res: Response): Promise<void> {
    const sessionId = String(req.params.sessionId);
    const auth = await WorkspaceFileController.verifyAccess(req, sessionId, true);
    if (auth.error) {
      res.status(auth.status).json({ error: auth.error, message: auth.message });
      return;
    }

    const { path: rawPath, content } = req.body;
    const filePath = WorkspaceFileController.sanitizePath(rawPath);
    if (!filePath || content === undefined) {
      res.status(400).json({ error: 'INVALID_FILE_PATH', message: 'Invalid file path or missing content.' });
      return;
    }

    const sandbox = SandboxService.getSandbox(sessionId);
    if (!sandbox) {
      res.status(404).json({ error: 'SANDBOX_NOT_PROVISIONED' });
      return;
    }

    // Update file in sandbox allocation
    const existing = sandbox.files.get(filePath);
    const nextRevision = (existing?.revision || 0) + 1;
    sandbox.files.set(filePath, {
      content,
      originalContent: existing?.originalContent ?? content,
      revision: nextRevision,
    });

    // Increment monotonic workspace revision in DB
    await AssessmentModel.findByIdAndUpdate(sessionId, {
      $inc: { workspaceRevision: 1 },
      $set: { lastHeartbeatAt: new Date() },
    });

    res.status(200).json({
      status: 'success',
      path: filePath,
      revision: nextRevision,
      isModified: content !== (existing?.originalContent ?? content),
    });
  }

  /**
   * GET /api/workspace/:sessionId/diff
   * Returns server-generated visual Git diff against immutable starter baseline using LCS (Decision 6.4).
   */
  public static async getDiff(req: Request, res: Response): Promise<void> {
    const sessionId = String(req.params.sessionId);
    const auth = await WorkspaceFileController.verifyAccess(req, sessionId);
    if (auth.error) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    const sandbox = SandboxService.getSandbox(sessionId);
    if (!sandbox) {
      res.status(404).json({ error: 'SANDBOX_NOT_PROVISIONED' });
      return;
    }

    const diffs: Array<{
      path: string;
      status: 'modified' | 'added' | 'deleted';
      additions: number;
      deletions: number;
    }> = [];

    sandbox.files.forEach((file, path) => {
      if (file.content !== file.originalContent) {
        const { additions, deletions } = computeLineDiff(file.originalContent, file.content);
        diffs.push({
          path,
          status: 'modified',
          additions,
          deletions,
        });
      }
    });

    res.status(200).json({ status: 'success', diffs, count: diffs.length });
  }

  /**
   * POST /api/workspace/:sessionId/flush
   * Explicitly acknowledges flushing all pending client edits (Decision 6.4).
   * Rejects if session is frozen or immutable.
   */
  public static async flushWorkspace(req: Request, res: Response): Promise<void> {
    const sessionId = String(req.params.sessionId);
    const auth = await WorkspaceFileController.verifyAccess(req, sessionId, true);
    if (auth.error) {
      res.status(auth.status).json({ error: auth.error, message: auth.message });
      return;
    }

    res.status(200).json({ status: 'success', flushedAt: new Date().toISOString() });
  }
}
