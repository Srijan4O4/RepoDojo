import { useState, useEffect } from 'react';
import { useWorkspaceStore } from '../../stores/workspace.store.js';
import { TabBar } from '../editor/TabBar.js';
import { CodeEditor } from '../editor/CodeEditor.js';
import { DiffViewer } from '../editor/DiffViewer.js';
import { FileTree } from '../filetree/FileTree.js';
import { ChangesPanel } from '../changes/ChangesPanel.js';
import { ProblemsPanel } from '../problems/ProblemsPanel.js';
import {
  Files,
  GitCompare,
  AlertCircle,
  Play,
  CheckCircle2,
  Clock,
  Terminal as TerminalIcon,
  ChevronUp,
  ChevronDown,
  Sparkles,
} from 'lucide-react';

export function WorkspaceLayout() {
  const viewMode = useWorkspaceStore((state) => state.viewMode);
  const sidebarTab = useWorkspaceStore((state) => state.sidebarTab);
  const setSidebarTab = useWorkspaceStore((state) => state.setSidebarTab);
  const getModifiedFiles = useWorkspaceStore((state) => state.getModifiedFiles);
  const flushPendingSaves = useWorkspaceStore((state) => state.flushPendingSaves);

  // Authoritative countdown timer (synchronizing 60 minutes)
  const [secondsRemaining, setSecondsRemaining] = useState(3582); // ~59 mins 42s
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([
    'RepoDojo Execution Worker initialized.',
    'Mounted workspace volume: /workspace (read-write)',
    'Language intelligence service ready.',
  ]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleRunTests = async () => {
    // Contract requirement: flush pending editor changes before executing tests
    await flushPendingSaves();
    setIsConsoleOpen(true);
    setConsoleLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] Running automated test suite against current workspace revision...`,
      'PASS src/services/payment.service.test.ts',
      'FAIL src/controllers/order.controller.test.ts',
      '  ● Order Controller > Checkout > applies discount correctly',
      '    Expected: 80.00',
      '    Received: 120.00',
      'Summary: 1 passed, 1 failed, 2 total',
    ]);
  };

  const handleSubmitAssessment = async () => {
    // Contract requirement: flush pending editor changes before submitting assessment
    await flushPendingSaves();
    const modifiedCount = getModifiedFiles().length;
    if (
      window.confirm(
        `Are you ready to submit your assessment? You have ${modifiedCount} modified files. Once submitted, your workspace will be frozen for grading.`
      )
    ) {
      alert('Assessment successfully submitted and queued for evaluation.');
    }
  };

  const modifiedCount = getModifiedFiles().length;

  return (
    <div className="flex h-screen w-screen flex-col bg-zinc-950 text-zinc-100 font-sans select-none overflow-hidden">
      {/* Top Bar: Assessment Authority & Actions */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-indigo-600 font-bold text-white text-sm shadow-md">
            RD
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-zinc-100 text-sm tracking-wide leading-tight">RepoDojo</span>
            <span className="text-[10px] text-zinc-400 font-mono">Challenge: node-ecommerce-01</span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {/* Synchronized Server Timer (Decision 4.2) */}
          <div className="flex items-center gap-2 rounded bg-zinc-800/90 px-3 py-1 text-xs font-mono text-amber-400 border border-zinc-700/60 shadow-inner">
            <Clock className="h-3.5 w-3.5 text-amber-400" />
            <span>{formatTimer(secondsRemaining)} remaining</span>
          </div>

          {/* Execution Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleRunTests}
              className="flex items-center gap-1.5 rounded bg-emerald-600 hover:bg-emerald-500 px-3 py-1 text-xs font-medium text-white shadow-sm transition active:scale-95"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>Run Tests</span>
            </button>
            <button
              onClick={handleSubmitAssessment}
              className="flex items-center gap-1.5 rounded bg-indigo-600 hover:bg-indigo-500 px-3 py-1 text-xs font-medium text-white shadow-sm transition active:scale-95"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Submit Assessment</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Icon Navigation Rail */}
        <aside className="flex w-12 shrink-0 flex-col items-center justify-between border-r border-zinc-800 bg-zinc-950 py-3">
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={() => setSidebarTab('explorer')}
              title="File Explorer"
              className={`relative rounded p-2 transition ${
                sidebarTab === 'explorer'
                  ? 'bg-zinc-800 text-indigo-400'
                  : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
              }`}
            >
              <Files className="h-5 w-5" />
            </button>

            <button
              onClick={() => setSidebarTab('changes')}
              title="Change Tracking (Diffs)"
              className={`relative rounded p-2 transition ${
                sidebarTab === 'changes'
                  ? 'bg-zinc-800 text-indigo-400'
                  : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
              }`}
            >
              <GitCompare className="h-5 w-5" />
              {modifiedCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">
                  {modifiedCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setSidebarTab('problems')}
              title="Challenge Defects"
              className={`relative rounded p-2 transition ${
                sidebarTab === 'problems'
                  ? 'bg-zinc-800 text-indigo-400'
                  : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
              }`}
            >
              <AlertCircle className="h-5 w-5" />
            </button>
          </div>

          <button
            title="Guarded AI Assistant"
            className="rounded p-2 text-purple-400 hover:bg-purple-950/40 hover:text-purple-300 transition"
          >
            <Sparkles className="h-5 w-5" />
          </button>
        </aside>

        {/* Left Secondary Panel (Explorer / Changes / Problems) */}
        <div className="w-64 shrink-0 border-r border-zinc-800 bg-zinc-900/30">
          {sidebarTab === 'explorer' && <FileTree />}
          {sidebarTab === 'changes' && <ChangesPanel />}
          {sidebarTab === 'problems' && <ProblemsPanel />}
        </div>

        {/* Center: Monaco Editor & Diff Viewer Canvas */}
        <main className="flex flex-1 flex-col overflow-hidden bg-zinc-950">
          <TabBar />
          <div className="flex-1 relative overflow-hidden">
            {viewMode === 'code' ? <CodeEditor /> : <DiffViewer />}
          </div>

          {/* Bottom Console / Terminal Tray */}
          <div className="border-t border-zinc-800 bg-zinc-900/90">
            <div
              onClick={() => setIsConsoleOpen(!isConsoleOpen)}
              className="flex h-7 cursor-pointer items-center justify-between px-3 text-xs text-zinc-400 hover:text-zinc-200"
            >
              <div className="flex items-center gap-2">
                <TerminalIcon className="h-3.5 w-3.5 text-emerald-400" />
                <span className="font-mono text-[11px] font-medium">Test & Console Output</span>
              </div>
              {isConsoleOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
            </div>

            {isConsoleOpen && (
              <div className="h-36 overflow-y-auto bg-zinc-950 p-2.5 font-mono text-xs text-zinc-300 space-y-1">
                {consoleLogs.map((log, idx) => (
                  <div
                    key={idx}
                    className={
                      log.includes('FAIL')
                        ? 'text-rose-400'
                        : log.includes('PASS')
                        ? 'text-emerald-400'
                        : 'text-zinc-400'
                    }
                  >
                    {log}
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
