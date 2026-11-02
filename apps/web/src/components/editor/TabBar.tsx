import { useWorkspaceStore } from '../../stores/workspace.store.js';
import { X, GitCompare, Code2, Cloud, Check, Loader2 } from 'lucide-react';

export function TabBar() {
  const openTabs = useWorkspaceStore((state) => state.openTabs);
  const activeFilePath = useWorkspaceStore((state) => state.activeFilePath);
  const files = useWorkspaceStore((state) => state.files);
  const setActiveFile = useWorkspaceStore((state) => state.setActiveFile);
  const closeTab = useWorkspaceStore((state) => state.closeTab);
  const viewMode = useWorkspaceStore((state) => state.viewMode);
  const setViewMode = useWorkspaceStore((state) => state.setViewMode);
  const syncStatus = useWorkspaceStore((state) => state.syncStatus);

  if (openTabs.length === 0) {
    return (
      <div className="flex h-9 items-center justify-between border-b border-zinc-800 bg-zinc-900/40 px-3 text-xs text-zinc-500">
        <span>No files open</span>
      </div>
    );
  }

  return (
    <div className="flex h-9 items-center justify-between border-b border-zinc-800 bg-zinc-900/60 select-none">
      {/* File Tabs List */}
      <div className="flex h-full items-center overflow-x-auto no-scrollbar">
        {openTabs.map((path) => {
          const file = files[path];
          if (!file) return null;
          const isActive = activeFilePath === path;

          return (
            <div
              key={path}
              onClick={() => setActiveFile(path)}
              className={`group flex h-full cursor-pointer items-center gap-2 border-r border-zinc-800 px-3.5 text-xs transition ${
                isActive
                  ? 'border-t-2 border-t-indigo-500 bg-zinc-950 font-medium text-zinc-100'
                  : 'bg-zinc-900/40 text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200'
              }`}
            >
              <span className="truncate max-w-[150px]">{file.name}</span>

              {/* Dirty indicator or close button */}
              <div className="flex items-center">
                {file.isModified && !file.isSaved ? (
                  <span
                    className="h-2 w-2 rounded-full bg-amber-400 group-hover:hidden"
                    title="Unsaved changes (auto-saving...)"
                  />
                ) : null}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(path);
                  }}
                  className={`rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 ${
                    file.isModified && !file.isSaved ? 'hidden group-hover:block' : ''
                  }`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Editor Controls & Auto-Save Sync Status */}
      <div className="flex items-center gap-3 px-3">
        {/* Sync Status Badge */}
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-400">
          {syncStatus.state === 'saving' ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
              <span className="text-amber-400">Saving...</span>
            </>
          ) : syncStatus.state === 'saved' ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-zinc-400">Saved</span>
            </>
          ) : (
            <>
              <Cloud className="h-3.5 w-3.5 text-zinc-500" />
              <span>Synced</span>
            </>
          )}
        </div>

        {/* View Mode Toggle: Code vs Diff */}
        <div className="flex items-center rounded border border-zinc-800 bg-zinc-800/40 p-0.5">
          <button
            onClick={() => setViewMode('code')}
            title="Standard Code Editor"
            className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] transition ${
              viewMode === 'code' ? 'bg-indigo-600 text-white font-medium' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Code2 className="h-3 w-3" />
            <span>Code</span>
          </button>
          <button
            onClick={() => setViewMode('diff')}
            title="Integrated Diff Viewer"
            className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] transition ${
              viewMode === 'diff' ? 'bg-indigo-600 text-white font-medium' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <GitCompare className="h-3 w-3" />
            <span>Diff</span>
          </button>
        </div>
      </div>
    </div>
  );
}
