import type { Request, Response } from 'express';
import { SandboxService } from '../services/sandbox.service.js';
import { AssessmentModel } from '../../assessment/models/assessment.model.js';

export class WorkspaceFileController {
  /**
   * Sanitizes and validates workspace file path against directory traversal attacks.
   */
  private static sanitizePath(rawPath: string): string | null {
    if (!rawPath || typeof rawPath !== 'string') return null;
    const normalized = rawPath.replace(/\\/g, '/').trim();
    if (normalized.includes('..') || normalized.startsWith('/') || normalized.startsWith('./')) {
      return null;
    }
    return normalized;
  }

  /**
   * Verifies session authorization.
   */
  private static async verifyAccess(req: Request, sessionId: string) {
    const candidateId = req.user?.sub;
    const role = req.user?.role;

    const session = await AssessmentModel.findById(sessionId);
    if (!session) return { error: 'SESSION_NOT_FOUND', status: 404 };

    if (session.candidateId.toString() !== candidateId && role !== 'admin') {
      return { error: 'FORBIDDEN', status: 403 };
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
   */
  public static async saveFile(req: Request, res: Response): Promise<void> {
    const sessionId = String(req.params.sessionId);
    const auth = await WorkspaceFileController.verifyAccess(req, sessionId);
    if (auth.error) {
      res.status(auth.status).json({ error: auth.error });
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
   * Returns server-generated visual Git diff against immutable starter baseline (Decision 6.4).
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
        const origLines = new Set(file.originalContent.split('\n'));
        const modLines = new Set(file.content.split('\n'));

        let additions = 0;
        let deletions = 0;

        file.content.split('\n').forEach((l) => {
          if (!origLines.has(l)) additions++;
        });
        file.originalContent.split('\n').forEach((l) => {
          if (!modLines.has(l)) deletions++;
        });

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
   */
  public static async flushWorkspace(req: Request, res: Response): Promise<void> {
    const sessionId = String(req.params.sessionId);
    const auth = await WorkspaceFileController.verifyAccess(req, sessionId);
    if (auth.error) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    res.status(200).json({ status: 'success', flushedAt: new Date().toISOString() });
  }
}
