import type { Request, Response } from 'express';
import { AIGatewayService } from '../services/ai-gateway.service.js';
import { AIInteractionModel } from '../models/ai-interaction.model.js';

export class AIController {
  /**
   * POST /api/ai/chat/stream
   * Streams Socratic guidance via Server-Sent Events (SSE).
   */
  public static async streamChat(req: Request, res: Response): Promise<void> {
    const candidateId = req.user?.sub;
    if (!candidateId) {
      res.status(401).json({ error: 'UNAUTHORIZED' });
      return;
    }

    const {
      sessionId,
      prompt,
      activeFile,
      selectedCode,
      terminalError,
      assistanceLevel,
    } = req.body;

    if (!sessionId || !prompt) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Both "sessionId" and "prompt" are required.',
      });
      return;
    }

    await AIGatewayService.streamAssistantResponse({
      sessionId,
      candidateId,
      prompt,
      activeFile,
      selectedCode,
      terminalError,
      assistanceLevel,
      res,
    });
  }

  /**
   * GET /api/ai/session/:sessionId/budget
   * Returns token usage metrics and remaining allowance.
   */
  public static async getBudget(req: Request, res: Response): Promise<void> {
    const sessionId = String(req.params.sessionId);
    try {
      const budget = await AIGatewayService.getSessionBudget(sessionId);
      res.status(200).json({ status: 'success', budget });
    } catch (err: any) {
      res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message });
    }
  }

  /**
   * GET /api/ai/session/:sessionId/history
   * Retrieves past Socratic interaction turns.
   */
  public static async getHistory(req: Request, res: Response): Promise<void> {
    const sessionId = String(req.params.sessionId);
    const candidateId = req.user?.sub;
    const role = req.user?.role;

    try {
      const query: Record<string, any> = { sessionId };
      if (role !== 'admin' && candidateId) {
        query.candidateId = candidateId;
      }

      const history = await AIInteractionModel.find(query).sort({ turnNumber: 1 });
      res.status(200).json({
        status: 'success',
        count: history.length,
        interactions: history.map((item) => ({
          turnNumber: item.turnNumber,
          prompt: item.prompt,
          response: item.response,
          activeFile: item.activeFile,
          assistanceLevel: item.assistanceLevel,
          tokensUsed: item.tokensUsed,
          guardrailTriggered: item.guardrailTriggered,
          createdAt: item.createdAt,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message });
    }
  }
}
