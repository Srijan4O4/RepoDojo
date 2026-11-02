import { useWorkspaceStore } from '../../stores/workspace.store.js';
import { AlertCircle, FileCode, CheckCircle2 } from 'lucide-react';

interface ProblemItem {
  id: string;
  title: string;
  affectedFile: string;
  description: string;
  points: number;
}

const PROBLEMS: ProblemItem[] = [
  {
    id: 'DEF-01',
    title: 'Missing Route Mounting & CORS Configuration',
    affectedFile: 'src/index.ts',
    description: 'The Express application fails to configure required CORS headers for cross-origin client requests.',
    points: 6,
  },
  {
    id: 'DEF-02',
    title: 'Off-by-one Discount Calculation',
    affectedFile: 'src/controllers/order.controller.ts',
    description: 'Discount calculations fail on edge quantity boundaries.',
    points: 6,
  },
  {
    id: 'DEF-03',
    title: 'Unawaited Payment Gateway Promise',
    affectedFile: 'src/controllers/order.controller.ts',
    description: 'Checkout handler sends response before payment gateway promise resolves, causing intermittent checkout failure.',
    points: 6,
  },
  {
    id: 'DEF-04',
    title: 'Inverted Discount Multiplier Logic',
    affectedFile: 'src/services/payment.service.ts',
    description: 'Promo code SAVE20 multiplies total by 1.2 instead of 0.8, overcharging candidates.',
    points: 6,
  },
];

export function ProblemsPanel() {
  const openFile = useWorkspaceStore((state) => state.openFile);
  const files = useWorkspaceStore((state) => state.files);

  return (
    <div className="flex h-full flex-col bg-zinc-900/50 select-none">
      <div className="flex h-10 items-center justify-between border-b border-zinc-800 px-3 text-xs">
        <div className="flex items-center gap-1.5 font-medium text-zinc-300">
          <AlertCircle className="h-4 w-4 text-amber-400" />
          <span>Challenge Defects</span>
          <span className="rounded bg-zinc-800 px-1.5 py-0.2 text-[10px] text-zinc-400 font-mono">
            {PROBLEMS.length}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {PROBLEMS.map((problem) => {
          const file = files[problem.affectedFile];
          const isFileTouched = file?.isModified;

          return (
            <div
              key={problem.id}
              className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2.5 text-xs hover:border-zinc-700 transition"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-[11px] font-bold text-amber-400">{problem.id}</span>
                <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                  {problem.points} pts
                </span>
              </div>

              <div className="font-semibold text-zinc-200 mb-1">{problem.title}</div>
              <p className="text-[11px] text-zinc-400 leading-relaxed mb-2">{problem.description}</p>

              <button
                onClick={() => openFile(problem.affectedFile)}
                className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 transition"
              >
                <FileCode className="h-3 w-3" />
                <span className="font-mono underline">{problem.affectedFile}</span>
                {isFileTouched && (
                  <span className="ml-1 flex items-center gap-0.5 text-[10px] text-emerald-400">
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    <span>Edited</span>
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
