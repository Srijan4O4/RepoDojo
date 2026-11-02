import { Router, Request, Response } from 'express';
import { WorkspaceFileController } from '../controllers/workspace-file.controller.js';
import { SandboxService } from '../services/sandbox.service.js';
import { TerminalGatewayService } from '../services/terminal-gateway.service.js';
import { requireAuth } from '../../auth/middleware/auth.middleware.js';
import { requireSessionAccess } from '../middleware/sandbox-auth.middleware.js';
import { ChallengeModel } from '../../challenge/models/challenge.model.js';

const router = Router();

// All sandbox and workspace endpoints require authentication
router.use(requireAuth);

// =============================================================================
// Workspace File Gateway (Decision 6.4 & SEC-02)
// =============================================================================
router.get('/:sessionId/tree', requireSessionAccess(), WorkspaceFileController.getFileTree);
router.get('/:sessionId/file', requireSessionAccess(), WorkspaceFileController.getFile);
router.put('/:sessionId/file', requireSessionAccess({ requireActiveForMutation: true }), WorkspaceFileController.saveFile);
router.get('/:sessionId/diff', requireSessionAccess(), WorkspaceFileController.getDiff);
router.post('/:sessionId/flush', requireSessionAccess({ requireActiveForMutation: true }), WorkspaceFileController.flushWorkspace);

// =============================================================================
// Sandbox Lifecycle & Terminal Endpoints (Infrastructure Contract §1 & §6 & SEC-02)
// =============================================================================
router.get('/:sessionId/status', requireSessionAccess(), async (req: Request, res: Response) => {
  const sessionId = String(req.params.sessionId);
  const stats = SandboxService.getSandboxStats(sessionId);
  if (!stats) {
    res.status(404).json({ error: 'SANDBOX_NOT_FOUND', message: 'Sandbox allocation not found.' });
    return;
  }
  res.status(200).json({ status: 'success', stats });
});

router.post(
  '/:sessionId/provision',
  requireSessionAccess({ requireActiveForMutation: true }),
  async (req: Request, res: Response) => {
    const sessionId = String(req.params.sessionId);
    const session = req.assessmentSession!;

    // Load starter files from challenge
    const challenge = await ChallengeModel.findOne({ id: session.challengeId });
    const starterFiles = (challenge?.starterFiles as Record<string, string>) || {};

    const sandbox = await SandboxService.provisionSandbox({
      sessionId,
      candidateId: session.candidateId.toString(),
      challengeId: session.challengeId,
      durationMinutes: session.durationMinutes,
      starterFiles,
    });

    // Update session with containerId and previewUrl
    session.containerId = sandbox.containerId;
    session.previewUrl = sandbox.previewUrl;
    if (session.status === 'CREATED') {
      session.status = 'READY';
    }
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
  }
);

router.post('/:sessionId/terminate', requireSessionAccess(), async (req: Request, res: Response) => {
  const sessionId = String(req.params.sessionId);
  const result = await SandboxService.terminateSandbox(sessionId, 'ABANDONED');
  res.status(200).json({ status: 'success', result });
});

router.get('/:sessionId/terminal/replay', requireSessionAccess(), (req: Request, res: Response) => {
  const sessionId = String(req.params.sessionId);
  const output = TerminalGatewayService.getReplayOutput(sessionId);
  res.status(200).json({ status: 'success', output });
});

export const workspaceRouter = router;
