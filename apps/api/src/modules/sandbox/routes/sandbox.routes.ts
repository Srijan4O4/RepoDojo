import { Router, Request, Response } from 'express';
import { WorkspaceFileController } from '../controllers/workspace-file.controller.js';
import { SandboxService } from '../services/sandbox.service.js';
import { TerminalGatewayService } from '../services/terminal-gateway.service.js';
import { requireAuth } from '../../auth/middleware/auth.middleware.js';
import { AssessmentModel } from '../../assessment/models/assessment.model.js';
import { ChallengeModel } from '../../challenge/models/challenge.model.js';

const router = Router();

// All sandbox and workspace endpoints require authentication
router.use(requireAuth);

// =============================================================================
// Workspace File Gateway (Decision 6.4)
// =============================================================================
router.get('/:sessionId/tree', WorkspaceFileController.getFileTree);
router.get('/:sessionId/file', WorkspaceFileController.getFile);
router.put('/:sessionId/file', WorkspaceFileController.saveFile);
router.get('/:sessionId/diff', WorkspaceFileController.getDiff);
router.post('/:sessionId/flush', WorkspaceFileController.flushWorkspace);

// =============================================================================
// Sandbox Lifecycle & Terminal Endpoints (Infrastructure Contract §1 & §6)
// =============================================================================
router.get('/:sessionId/status', async (req: Request, res: Response) => {
  const sessionId = String(req.params.sessionId);
  const stats = SandboxService.getSandboxStats(sessionId);
  if (!stats) {
    res.status(404).json({ error: 'SANDBOX_NOT_FOUND' });
    return;
  }
  res.status(200).json({ status: 'success', stats });
});

router.post('/:sessionId/provision', async (req: Request, res: Response) => {
  const sessionId = String(req.params.sessionId);
  const candidateId = req.user?.sub;

  const session = await AssessmentModel.findById(sessionId);
  if (!session) {
    res.status(404).json({ error: 'SESSION_NOT_FOUND' });
    return;
  }

  // Load starter files from challenge
  const challenge = await ChallengeModel.findOne({ id: session.challengeId });
  const starterFiles = (challenge?.starterFiles as Record<string, string>) || {};

  const sandbox = await SandboxService.provisionSandbox({
    sessionId,
    candidateId: candidateId || session.candidateId.toString(),
    challengeId: session.challengeId,
    durationMinutes: session.durationMinutes,
    starterFiles,
  });

  // Update session with containerId and previewUrl
  session.containerId = sandbox.containerId;
  session.previewUrl = sandbox.previewUrl;
  session.status = session.status === 'CREATED' ? 'READY' : session.status;
  await session.save();

  res.status(201).json({
    status: 'success',
    sandbox: {
      containerId: sandbox.containerId,
      bridgeIp: sandbox.bridgeIp,
      ports: sandbox.ports,
      previewUrl: sandbox.previewUrl,
      ptyWsEndpoint: sandbox.ptyWsEndpoint,
    },
  });
});

router.get('/:sessionId/terminal/replay', (req: Request, res: Response) => {
  const sessionId = String(req.params.sessionId);
  const output = TerminalGatewayService.getReplayOutput(sessionId);
  res.status(200).json({ status: 'success', output });
});

export const workspaceRouter = router;
