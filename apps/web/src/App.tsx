import { Terminal, Code2, Bot, Play, Clock, CheckCircle2, Layers } from 'lucide-react';

export function App() {
  return (
    <div className="flex h-screen w-screen flex-col bg-zinc-950 text-zinc-100 font-sans">
      {/* Header: Persistent Assessment Bar (Domain 7) */}
      <header className="flex h-12 items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-indigo-600 font-bold text-white text-sm">
            RD
          </div>
          <span className="font-semibold text-zinc-100 text-sm tracking-wide">RepoDojo</span>
          <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">Node.js Assessment v0.4</span>
        </div>

        <div className="flex items-center gap-6">
          {/* Assessment Timer (Decision 4.2, 7.2) */}
          <div className="flex items-center gap-2 rounded bg-zinc-800/80 px-3 py-1 text-sm font-mono text-amber-400">
            <Clock className="h-4 w-4 text-amber-400" />
            <span>59:42 remaining</span>
          </div>

          {/* Process Controls */}
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 rounded bg-emerald-600 hover:bg-emerald-500 px-3 py-1 text-xs font-medium text-white transition">
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>Run Application</span>
            </button>
            <button className="flex items-center gap-1.5 rounded bg-indigo-600 hover:bg-indigo-500 px-3 py-1 text-xs font-medium text-white transition">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Submit Assessment</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace Canvas */}
      <main className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-2xl rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center backdrop-blur shadow-2xl">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
            RepoDojo Assessment Workspace
          </h1>
          <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
            Train on real codebases. Prepare for real engineering.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-4 text-left sm:grid-cols-4">
            <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/80 p-3">
              <Code2 className="h-5 w-5 text-indigo-400 mb-2" />
              <div className="text-xs font-semibold text-zinc-200">Monaco Editor</div>
              <div className="text-[11px] text-zinc-500">Diff Viewer + LSP</div>
            </div>
            <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/80 p-3">
              <Terminal className="h-5 w-5 text-emerald-400 mb-2" />
              <div className="text-xs font-semibold text-zinc-200">xterm.js</div>
              <div className="text-[11px] text-zinc-500">WebSocket PTY</div>
            </div>
            <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/80 p-3">
              <Bot className="h-5 w-5 text-purple-400 mb-2" />
              <div className="text-xs font-semibold text-zinc-200">Guarded AI</div>
              <div className="text-[11px] text-zinc-500">Gemini 3.8 Flash</div>
            </div>
            <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/80 p-3">
              <Layers className="h-5 w-5 text-amber-400 mb-2" />
              <div className="text-xs font-semibold text-zinc-200">Graphify</div>
              <div className="text-[11px] text-zinc-500">AST Code Graph</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
