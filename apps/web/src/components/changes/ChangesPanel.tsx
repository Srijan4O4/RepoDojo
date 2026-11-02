import { useWorkspaceStore } from '../../stores/workspace.store.js';
import { GitCompare, RotateCcw, CheckCircle2, FileCode } from 'lucide-react';

export function ChangesPanel() {
  const getModifiedFiles = useWorkspaceStore((state) => state.getModifiedFiles);
  const openFile = useWorkspaceStore((state) => state.openFile);
  const setViewMode = useWorkspaceStore((state) => state.setViewMode);
  const revertFile = useWorkspaceStore((state) => state.revertFile);
  const activeFilePath = useWorkspaceStore((state) => state.activeFilePath);

  const modifiedFiles = getModifiedFiles();

  const handleSelectDiff = (path: string) => {
    openFile(path);
    setViewMode('diff');
  };

  const handleDiscardAll = () => {
    if (window.confirm('Discard all local modifications and restore original starter code?')) {
      modifiedFiles.forEach((file) => revertFile(file.path));
    }
  };

  return (
    <div className="flex h-full flex-col bg-zinc-900/50 select-none">
      {/* Changes Header */}
      <div className="flex h-10 items-center justify-between border-b border-zinc-800 px-3 text-xs">
        <div className="flex items-center gap-1.5 font-medium text-zinc-300">
          <GitCompare className="h-4 w-4 text-indigo-400" />
          <span>Working Changes</span>
          <span className="rounded bg-zinc-800 px-1.5 py-0.2 text-[10px] text-zinc-400 font-mono">
            {modifiedFiles.length}
          </span>
        </div>

        {modifiedFiles.length > 0 && (
          <button
            onClick={handleDiscardAll}
            title="Discard all changes"
            className="flex items-center gap-1 rounded bg-zinc-800/80 hover:bg-zinc-800 px-2 py-0.5 text-[11px] text-rose-300 transition"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Discard All</span>
          </button>
        )}
      </div>

      {/* Changes List */}
      <div className="flex-1 overflow-y-auto p-2">
        {modifiedFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-zinc-500">
            <CheckCircle2 className="h-8 w-8 text-emerald-500/60 mb-2" />
            <p className="text-xs font-medium text-zinc-400">Working tree clean</p>
            <p className="text-[11px] text-zinc-600 mt-1">No modifications compared to starter baseline</p>
          </div>
        ) : (
          <div className="space-y-1">
            {modifiedFiles.map((item) => {
              const isActive = activeFilePath === item.path;
              const fileName = item.path.split('/').pop() || item.path;

              return (
                <div
                  key={item.path}
                  onClick={() => handleSelectDiff(item.path)}
                  className={`group flex cursor-pointer items-center justify-between rounded px-2.5 py-2 text-xs transition ${
                    isActive ? 'bg-indigo-600/20 text-indigo-200' : 'text-zinc-300 hover:bg-zinc-800/40'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="flex h-4 w-4 items-center justify-center rounded bg-amber-500/20 text-[10px] font-bold text-amber-400 shrink-0">
                      M
                    </span>
                    <FileCode className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                    <div className="flex flex-col truncate">
                      <span className="truncate font-medium">{fileName}</span>
                      <span className="truncate text-[10px] text-zinc-500 font-mono">{item.path}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1 font-mono text-[10px]">
                      <span className="text-emerald-400">+{item.additions}</span>
                      <span className="text-rose-400">-{item.deletions}</span>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`Discard modifications in ${fileName}?`)) {
                          revertFile(item.path);
                        }
                      }}
                      title="Discard file changes"
                      className="opacity-0 group-hover:opacity-100 rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-rose-400 transition"
                    >
                      <RotateCcw className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
