import { useRef } from 'react';
import { DiffEditor, DiffOnMount } from '@monaco-editor/react';
import { useWorkspaceStore } from '../../stores/workspace.store.js';
import { computeLineDiff } from '../../utils/language.utils.js';
import { RotateCcw, Code2, ArrowUp, ArrowDown, Loader2 } from 'lucide-react';

export function DiffViewer() {
  const activeFilePath = useWorkspaceStore((state) => state.activeFilePath);
  const files = useWorkspaceStore((state) => state.files);
  const updateFileContent = useWorkspaceStore((state) => state.updateFileContent);
  const revertFile = useWorkspaceStore((state) => state.revertFile);
  const setViewMode = useWorkspaceStore((state) => state.setViewMode);

  const diffEditorRef = useRef<any>(null);

  const activeFile = activeFilePath ? files[activeFilePath] : null;

  const handleDiffMount: DiffOnMount = (editor) => {
    diffEditorRef.current = editor;

    // Listen to changes in the modified editor model
    const modifiedModel = editor.getModifiedEditor().getModel();
    if (modifiedModel) {
      modifiedModel.onDidChangeContent(() => {
        const newValue = modifiedModel.getValue();
        if (activeFilePath) {
          updateFileContent(activeFilePath, newValue);
        }
      });
    }
  };

  const handleNextDiff = () => {
    if (diffEditorRef.current) {
      const lineChanges = diffEditorRef.current.getLineChanges();
      if (lineChanges && lineChanges.length > 0) {
        const modifiedEditor = diffEditorRef.current.getModifiedEditor();
        const currentLine = modifiedEditor.getPosition()?.lineNumber || 1;
        const nextChange = lineChanges.find((c: any) => c.modifiedStartLineNumber > currentLine) || lineChanges[0];
        if (nextChange) {
          modifiedEditor.revealLineInCenter(nextChange.modifiedStartLineNumber);
          modifiedEditor.setPosition({ lineNumber: nextChange.modifiedStartLineNumber, column: 1 });
        }
      }
    }
  };

  const handlePrevDiff = () => {
    if (diffEditorRef.current) {
      const lineChanges = diffEditorRef.current.getLineChanges();
      if (lineChanges && lineChanges.length > 0) {
        const modifiedEditor = diffEditorRef.current.getModifiedEditor();
        const currentLine = modifiedEditor.getPosition()?.lineNumber || 1;
        const prevChanges = lineChanges.filter((c: any) => c.modifiedStartLineNumber < currentLine);
        const prevChange = prevChanges.length > 0 ? prevChanges[prevChanges.length - 1] : lineChanges[lineChanges.length - 1];
        if (prevChange) {
          modifiedEditor.revealLineInCenter(prevChange.modifiedStartLineNumber);
          modifiedEditor.setPosition({ lineNumber: prevChange.modifiedStartLineNumber, column: 1 });
        }
      }
    }
  };

  if (!activeFile) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-zinc-950 text-zinc-500">
        <p className="text-sm">Select a file to inspect diffs</p>
      </div>
    );
  }

  const { additions, deletions } = computeLineDiff(activeFile.originalContent, activeFile.content);

  return (
    <div className="flex h-full w-full flex-col bg-zinc-950">
      {/* Diff Toolbar Header */}
      <div className="flex h-9 items-center justify-between border-b border-zinc-800 bg-zinc-900/70 px-4 text-xs">
        <div className="flex items-center gap-3">
          <span className="font-mono text-zinc-300">{activeFile.path}</span>
          <div className="flex items-center gap-1.5 font-mono">
            <span className="rounded bg-emerald-950/80 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-400 border border-emerald-800/40">
              +{additions}
            </span>
            <span className="rounded bg-rose-950/80 px-1.5 py-0.5 text-[11px] font-semibold text-rose-400 border border-rose-800/40">
              -{deletions}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Diff Navigation */}
          <div className="flex items-center rounded border border-zinc-800 bg-zinc-800/40">
            <button
              onClick={handlePrevDiff}
              title="Previous difference"
              className="p-1 text-zinc-400 hover:text-zinc-200 transition"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <div className="h-3 w-px bg-zinc-700" />
            <button
              onClick={handleNextDiff}
              title="Next difference"
              className="p-1 text-zinc-400 hover:text-zinc-200 transition"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Revert Button */}
          {activeFile.isModified && (
            <button
              onClick={() => {
                if (window.confirm(`Revert all local changes in ${activeFile.name}? This cannot be undone.`)) {
                  revertFile(activeFile.path);
                }
              }}
              className="flex items-center gap-1 rounded bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1 text-xs text-amber-300 transition"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Revert to Starter</span>
            </button>
          )}

          {/* Return to Code View */}
          <button
            onClick={() => setViewMode('code')}
            className="flex items-center gap-1 rounded bg-indigo-600/80 hover:bg-indigo-600 px-2.5 py-1 text-xs text-white transition"
          >
            <Code2 className="h-3 w-3" />
            <span>Editor View</span>
          </button>
        </div>
      </div>

      {/* Side-by-side Monaco Diff Editor */}
      <div className="flex-1 relative">
        <DiffEditor
          height="100%"
          width="100%"
          theme="vs-dark"
          original={activeFile.originalContent}
          modified={activeFile.content}
          language={activeFile.language}
          onMount={handleDiffMount}
          loading={
            <div className="flex h-full w-full items-center justify-center gap-2 bg-zinc-950 text-zinc-400">
              <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
              <span className="text-xs">Computing Visual Diff...</span>
            </div>
          }
          options={{
            renderSideBySide: true,
            readOnly: false,
            originalEditable: false,
            automaticLayout: true,
            fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, monospace",
            fontSize: 13,
            lineHeight: 20,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            enableSplitViewResizing: true,
            diffWordWrap: 'off',
            renderIndicators: true,
          }}
        />
      </div>
    </div>
  );
}
