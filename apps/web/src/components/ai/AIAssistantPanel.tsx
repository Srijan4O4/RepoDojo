import React, { useState, useRef, useEffect } from 'react';
import { useAIAssistantStore } from '../../stores/ai-assistant.store.js';
import { useWorkspaceStore } from '../../stores/workspace.store.js';
import type { AssistanceLevel } from '@repodojo/shared';
import {
  Sparkles,
  X,
  Send,
  ShieldAlert,
  FileCode,
  Compass,
  Search,
  Wrench,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';

interface AIAssistantPanelProps {
  onClose?: () => void;
  sessionId?: string;
}

const LEVEL_CONFIG: Record<
  AssistanceLevel,
  { label: string; sublabel: string; icon: React.ComponentType<{ className?: string }> }
> = {
  1: {
    label: 'Level 1: Conceptual',
    sublabel: 'Socratic guiding questions, zero code leakage',
    icon: Compass,
  },
  2: {
    label: 'Level 2: Locator',
    sublabel: 'Points to relevant files, functions & DAG dependencies',
    icon: Search,
  },
  3: {
    label: 'Level 3: Debugging',
    sublabel: 'Targeted logic checks (max 7 lines of code capped)',
    icon: Wrench,
  },
};

const QUICK_PROMPTS = [
  'How should I investigate the discount calculation?',
  'Why does the checkout endpoint fail intermittently?',
  'Which file handles CORS and route mounting?',
];

export function AIAssistantPanel({ onClose, sessionId = 'demo-session-01' }: AIAssistantPanelProps) {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeFilePath = useWorkspaceStore((state) => state.activeFilePath);
  const files = useWorkspaceStore((state) => state.files);

  const {
    messages,
    isStreaming,
    assistanceLevel,
    includeActiveFileContext,
    budget,
    error,
    setAssistanceLevel,
    setIncludeActiveFileContext,
    sendMessage,
    clearHistory,
  } = useAIAssistantStore();

  const activeFile = activeFilePath ? files[activeFilePath] : undefined;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  const handleSend = async () => {
    if (!inputText.trim() || isStreaming) return;
    const promptToSend = inputText;
    setInputText('');

    await sendMessage({
      sessionId,
      prompt: promptToSend,
      activeFile: activeFilePath || undefined,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const budgetPercent = Math.max(0, Math.min(100, (budget.remainingTokens / budget.maxBudget) * 100));
  const budgetColor =
    budgetPercent > 40
      ? 'bg-emerald-500'
      : budgetPercent > 15
      ? 'bg-amber-500'
      : 'bg-rose-500';

  return (
    <div className="flex h-full w-full flex-col bg-zinc-900 border-l border-zinc-800 text-zinc-100 select-none">
      {/* 1. Header: Socratic Mentor + Close */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-zinc-800 px-3 bg-zinc-950/60">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-gradient-to-br from-purple-500 to-indigo-600 shadow-sm">
            <Sparkles className="h-3.5 w-3.5 text-white" />
          </div>
          <div>
            <span className="font-semibold text-xs tracking-wide text-zinc-100">Guarded Socratic Mentor</span>
            <span className="ml-2 text-[10px] font-mono text-purple-400">Gemini 2.5 Flash</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={clearHistory}
            title="Reset conversation"
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              title="Close Assistant"
              className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* 2. Token Budget Progress Bar (PRD §15 & Decision 8.2) */}
      <div className="border-b border-zinc-800 bg-zinc-950/40 px-3 py-2 text-xs">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-medium text-zinc-400">Assessment AI Budget</span>
          <span className="font-mono text-[11px] font-semibold text-zinc-300">
            {budget.remainingTokens.toLocaleString()} / {budget.maxBudget.toLocaleString()} tokens
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${budgetColor}`}
            style={{ width: `${budgetPercent}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-1 text-[10px] text-zinc-400 font-mono">
          <span>Turn {budget.turnCount}</span>
          {budget.remainingTokens <= 5000 && (
            <span className="text-amber-400 font-semibold">Budget low</span>
          )}
        </div>
      </div>

      {/* 3. Assistance Level Selector (Decision 8.1: Progressive Scaffolding) */}
      <div className="border-b border-zinc-800 bg-zinc-900/30 p-2.5">
        <div className="text-[11px] font-medium text-zinc-400 mb-1.5">Scaffolding Guidance Level</div>
        <div className="grid grid-cols-3 gap-1.5">
          {([1, 2, 3] as AssistanceLevel[]).map((level) => {
            const isSelected = assistanceLevel === level;
            const Icon = LEVEL_CONFIG[level].icon;
            return (
              <button
                key={level}
                onClick={() => setAssistanceLevel(level)}
                className={`flex flex-col items-center justify-center rounded border p-1.5 text-center transition ${
                  isSelected
                    ? 'border-purple-500 bg-purple-950/40 text-purple-200 shadow-sm'
                    : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300'
                }`}
              >
                <Icon className={`h-3.5 w-3.5 mb-1 ${isSelected ? 'text-purple-400' : 'text-zinc-400'}`} />
                <span className="text-[10px] font-semibold">L{level}</span>
                <span className="text-[9px] text-zinc-400 truncate max-w-full">
                  {level === 1 ? 'Concept' : level === 2 ? 'Locator' : 'Debug'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Active File Context Attachment */}
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950/20 px-3 py-1.5 text-xs">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={includeActiveFileContext}
            onChange={(e) => setIncludeActiveFileContext(e.target.checked)}
            className="rounded border-zinc-700 bg-zinc-800 text-purple-600 focus:ring-0 focus:ring-offset-0 h-3.5 w-3.5"
          />
          <span className="text-[11px] text-zinc-300">Send Active File</span>
        </label>
        {activeFile ? (
          <span className="flex items-center gap-1 font-mono text-[10px] text-zinc-400 bg-zinc-800/80 px-1.5 py-0.5 rounded">
            <FileCode className="h-3 w-3 text-purple-400" />
            <span className="truncate max-w-[140px]">{activeFile.name}</span>
          </span>
        ) : (
          <span className="text-[10px] text-zinc-400">None open</span>
        )}
      </div>

      {/* 5. Messages Scroll View */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 font-sans text-xs">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[90%] rounded-xl px-3 py-2 leading-relaxed shadow-sm ${
                  isUser
                    ? 'bg-purple-600 text-white rounded-br-none'
                    : 'bg-zinc-800/90 text-zinc-200 border border-zinc-700/60 rounded-bl-none'
                }`}
              >
                {/* Formatted Text Content */}
                <div className="whitespace-pre-wrap break-words">
                  {msg.text || (isStreaming && !isUser ? 'Thinking...' : '')}
                </div>

                {/* Guardrail Violation Warning Badge (ADR-001 Decision 8.3) */}
                {msg.guardrailTriggered && (
                  <div className="mt-2 flex items-center gap-1.5 rounded bg-amber-950/80 border border-amber-600/40 px-2 py-1 text-[10px] text-amber-300 font-mono">
                    <ShieldAlert className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                    <span>Guardrail applied: {msg.guardrailReason || 'Code truncated to 7-line cap'}</span>
                  </div>
                )}
              </div>
              <span className="mt-1 px-1 text-[9px] text-zinc-400 font-mono">
                {isUser ? 'Candidate' : 'Mentor'}
              </span>
            </div>
          );
        })}

        {isStreaming && (
          <div className="flex items-center gap-1 text-[11px] text-purple-400 font-mono italic animate-pulse">
            <Sparkles className="h-3 w-3 animate-spin" />
            <span>Formulating Socratic response...</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-1.5 rounded-lg border border-rose-800 bg-rose-950/50 p-2 text-rose-300 text-[11px]">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 6. Quick Starter Chips */}
      {messages.length <= 2 && (
        <div className="border-t border-zinc-800 bg-zinc-950/30 p-2">
          <div className="text-[10px] text-zinc-400 mb-1 font-medium">Suggested inquiries:</div>
          <div className="flex flex-col gap-1">
            {QUICK_PROMPTS.map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setInputText(prompt);
                  inputRef.current?.focus();
                }}
                className="text-left text-[11px] text-purple-300 hover:text-purple-200 bg-purple-950/30 hover:bg-purple-950/60 border border-purple-800/30 rounded px-2 py-1 transition truncate"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 7. Input Textarea & Send Bar */}
      <div className="border-t border-zinc-800 bg-zinc-950/80 p-2.5">
        <div className="relative flex items-end rounded-lg border border-zinc-700 bg-zinc-900 focus-within:border-purple-500 transition">
          <textarea
            ref={inputRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              budget.remainingTokens <= 50
                ? 'AI Token budget exhausted.'
                : 'Ask a debugging question... (Enter to send)'
            }
            disabled={isStreaming || budget.remainingTokens <= 50}
            rows={2}
            className="w-full resize-none bg-transparent px-2.5 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim() || isStreaming || budget.remainingTokens <= 50}
            className="m-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded bg-purple-600 text-white hover:bg-purple-500 disabled:bg-zinc-800 disabled:text-zinc-600 transition"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-1 flex items-center justify-between text-[9px] text-zinc-400">
          <span>Ask-only mode • Strict 7-line code limit</span>
          <span>Shift+Enter for newline</span>
        </div>
      </div>
    </div>
  );
}
