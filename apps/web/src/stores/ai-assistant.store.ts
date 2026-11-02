import { create } from 'zustand';
import type { AssistanceLevel } from '@repodojo/shared';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  assistanceLevel?: AssistanceLevel;
  guardrailTriggered?: boolean;
  guardrailReason?: string;
}

export interface TokenBudget {
  usedTokens: number;
  remainingTokens: number;
  maxBudget: number;
  turnCount: number;
}

interface AIAssistantState {
  isOpen: boolean;
  messages: ChatMessage[];
  isStreaming: boolean;
  assistanceLevel: AssistanceLevel;
  includeActiveFileContext: boolean;
  budget: TokenBudget;
  error: string | null;

  // Actions
  toggleOpen: () => void;
  setOpen: (open: boolean) => void;
  setAssistanceLevel: (level: AssistanceLevel) => void;
  setIncludeActiveFileContext: (include: boolean) => void;
  fetchBudget: (sessionId: string) => Promise<void>;
  sendMessage: (params: {
    sessionId: string;
    prompt: string;
    activeFile?: string;
    selectedCode?: string;
  }) => Promise<void>;
  clearHistory: () => void;
}

const DEFAULT_BUDGET: TokenBudget = {
  usedTokens: 0,
  remainingTokens: 50000,
  maxBudget: 50000,
  turnCount: 0,
};

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'welcome',
    role: 'assistant',
    text: "Welcome to RepoDojo! I'm your Socratic Senior Mentor. I'll guide you through debugging this codebase with questions and architectural hints. How can I help you investigate the defects?",
    timestamp: new Date().toISOString(),
    assistanceLevel: 1,
  },
];

export const useAIAssistantStore = create<AIAssistantState>((set, get) => ({
  isOpen: false,
  messages: INITIAL_MESSAGES,
  isStreaming: false,
  assistanceLevel: 1,
  includeActiveFileContext: true,
  budget: DEFAULT_BUDGET,
  error: null,

  toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),
  setOpen: (open) => set({ isOpen: open }),
  setAssistanceLevel: (level) => set({ assistanceLevel: level }),
  setIncludeActiveFileContext: (include) => set({ includeActiveFileContext: include }),

  fetchBudget: async (sessionId: string) => {
    try {
      const res = await fetch(`/api/ai/session/${sessionId}/budget`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === 'success' && data.budget) {
        set({ budget: data.budget });
      }
    } catch {
      // Keep optimistic budget on network failure
    }
  },

  sendMessage: async ({ sessionId, prompt, activeFile, selectedCode }) => {
    const trimmed = prompt.trim();
    if (!trimmed || get().isStreaming) return;

    const userMessageId = `user-${Date.now()}`;
    const assistantMessageId = `asst-${Date.now()}`;
    const currentLevel = get().assistanceLevel;

    // Append candidate user message
    const userMsg: ChatMessage = {
      id: userMessageId,
      role: 'user',
      text: trimmed,
      timestamp: new Date().toISOString(),
      assistanceLevel: currentLevel,
    };

    // Pre-allocate empty assistant message for streaming tokens
    const assistantMsg: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      text: '',
      timestamp: new Date().toISOString(),
      assistanceLevel: currentLevel,
    };

    set((state) => ({
      messages: [...state.messages, userMsg, assistantMsg],
      isStreaming: true,
      error: null,
    }));

    try {
      const payload: Record<string, unknown> = {
        sessionId,
        prompt: trimmed,
        assistanceLevel: currentLevel,
      };

      if (get().includeActiveFileContext && activeFile) {
        payload.activeFile = activeFile;
      }
      if (selectedCode) {
        payload.selectedCode = selectedCode;
      }

      const res = await fetch('/api/ai/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || `Request failed with status ${res.status}`);
      }

      if (!res.body) {
        throw new Error('ReadableStream not supported or empty response body');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      let guardrailTriggered = false;
      let guardrailReason: string | undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '{"type": "done"}' || raw === '{"type":"done"}') continue;

          try {
            const event = JSON.parse(raw);
            if (event.type === 'token') {
              accumulated += event.text;
              set((state) => ({
                messages: state.messages.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, text: accumulated, guardrailTriggered, guardrailReason }
                    : m
                ),
              }));
            } else if (event.type === 'usage') {
              const used = (event.inputTokens || 0) + (event.outputTokens || 0);
              set((state) => ({
                budget: {
                  ...state.budget,
                  usedTokens: state.budget.usedTokens + used,
                  remainingTokens: Math.max(0, state.budget.remainingTokens - used),
                  turnCount: state.budget.turnCount + 1,
                },
              }));
            } else if (event.type === 'guardrail') {
              guardrailTriggered = event.triggered;
              guardrailReason = event.reason;
              set((state) => ({
                messages: state.messages.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, guardrailTriggered, guardrailReason }
                    : m
                ),
              }));
            }
          } catch {
            // Ignore non-json SSE lines
          }
        }
      }
    } catch (err: any) {
      set({ error: err.message || 'Failed to stream response from AI Mentor.' });
      // Remove empty assistant placeholder on error
      set((state) => ({
        messages: state.messages.filter((m) => m.id !== assistantMessageId || m.text.length > 0),
      }));
    } finally {
      set({ isStreaming: false });
    }
  },

  clearHistory: () =>
    set({
      messages: INITIAL_MESSAGES,
      error: null,
    }),
}));
