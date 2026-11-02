import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useAIAssistantStore } from '../../../stores/ai-assistant.store.js';

describe('Domain 8: Web IDE Socratic AI Assistant Store', () => {
  beforeEach(() => {
    // Reset store to known baseline
    useAIAssistantStore.setState({
      isOpen: false,
      messages: [
        {
          id: 'welcome',
          role: 'assistant',
          text: 'Welcome to RepoDojo!',
          timestamp: new Date().toISOString(),
          assistanceLevel: 1,
        },
      ],
      isStreaming: false,
      assistanceLevel: 1,
      includeActiveFileContext: true,
      budget: {
        usedTokens: 0,
        remainingTokens: 50000,
        maxBudget: 50000,
        turnCount: 0,
      },
      error: null,
    });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with 50,000 token budget and Level 1 conceptual guidance', () => {
    const state = useAIAssistantStore.getState();
    expect(state.budget.maxBudget).toBe(50000);
    expect(state.budget.remainingTokens).toBe(50000);
    expect(state.budget.usedTokens).toBe(0);
    expect(state.budget.turnCount).toBe(0);
    expect(state.assistanceLevel).toBe(1);
    expect(state.includeActiveFileContext).toBe(true);
    expect(state.isOpen).toBe(false);
    expect(state.messages.length).toBe(1);
  });

  it('should toggle panel open and closed', () => {
    const { toggleOpen, setOpen } = useAIAssistantStore.getState();

    toggleOpen();
    expect(useAIAssistantStore.getState().isOpen).toBe(true);

    toggleOpen();
    expect(useAIAssistantStore.getState().isOpen).toBe(false);

    setOpen(true);
    expect(useAIAssistantStore.getState().isOpen).toBe(true);
  });

  it('should switch between scaffolding assistance levels (1, 2, 3)', () => {
    const { setAssistanceLevel } = useAIAssistantStore.getState();

    setAssistanceLevel(2);
    expect(useAIAssistantStore.getState().assistanceLevel).toBe(2);

    setAssistanceLevel(3);
    expect(useAIAssistantStore.getState().assistanceLevel).toBe(3);

    setAssistanceLevel(1);
    expect(useAIAssistantStore.getState().assistanceLevel).toBe(1);
  });

  it('should toggle active file context flag', () => {
    const { setIncludeActiveFileContext } = useAIAssistantStore.getState();

    setIncludeActiveFileContext(false);
    expect(useAIAssistantStore.getState().includeActiveFileContext).toBe(false);

    setIncludeActiveFileContext(true);
    expect(useAIAssistantStore.getState().includeActiveFileContext).toBe(true);
  });

  it('should stream tokens from SSE response, update budget and apply guardrail metadata', async () => {
    const mockSSEStream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(
          encoder.encode('data: {"type": "token", "text": "Consider "}\n\n')
        );
        controller.enqueue(
          encoder.encode('data: {"type": "token", "text": "checking "}\n\n')
        );
        controller.enqueue(
          encoder.encode('data: {"type": "token", "text": "payment.service.ts."}\n\n')
        );
        controller.enqueue(
          encoder.encode(
            'data: {"type": "guardrail", "triggered": true, "reason": "Code truncated to 7-line cap"}\n\n'
          )
        );
        controller.enqueue(
          encoder.encode('data: {"type": "usage", "inputTokens": 100, "outputTokens": 50}\n\n')
        );
        controller.enqueue(encoder.encode('data: {"type": "done"}\n\n'));
        controller.close();
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: mockSSEStream,
      json: vi.fn(),
    });

    const { sendMessage } = useAIAssistantStore.getState();
    await sendMessage({
      sessionId: 'session-abc-123',
      prompt: 'Why is discount calculation inverted?',
      activeFile: 'src/services/payment.service.ts',
    });

    const state = useAIAssistantStore.getState();
    expect(state.isStreaming).toBe(false);
    expect(state.messages.length).toBe(3); // Initial welcome + user + assistant

    const userMsg = state.messages[1];
    expect(userMsg.role).toBe('user');
    expect(userMsg.text).toBe('Why is discount calculation inverted?');

    const assistantMsg = state.messages[2];
    expect(assistantMsg.role).toBe('assistant');
    expect(assistantMsg.text).toBe('Consider checking payment.service.ts.');
    expect(assistantMsg.guardrailTriggered).toBe(true);
    expect(assistantMsg.guardrailReason).toBe('Code truncated to 7-line cap');

    // Budget deduction verification
    expect(state.budget.usedTokens).toBe(150);
    expect(state.budget.remainingTokens).toBe(50000 - 150);
    expect(state.budget.turnCount).toBe(1);
  });

  it('should handle API errors gracefully without crashing the UI', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: vi.fn().mockResolvedValue({ message: 'Token budget exhausted' }),
    });

    const { sendMessage } = useAIAssistantStore.getState();
    await sendMessage({
      sessionId: 'session-abc-123',
      prompt: 'Help me',
    });

    const state = useAIAssistantStore.getState();
    expect(state.isStreaming).toBe(false);
    expect(state.error).toBe('Token budget exhausted');
  });

  it('should reset conversation history when clearHistory is invoked', () => {
    const state = useAIAssistantStore.getState();
    state.messages.push({
      id: 'custom-1',
      role: 'user',
      text: 'My custom question',
      timestamp: new Date().toISOString(),
    });

    state.clearHistory();
    const updated = useAIAssistantStore.getState();
    expect(updated.messages.length).toBe(1);
    expect(updated.messages[0].id).toBe('welcome');
    expect(updated.error).toBeNull();
  });
});
