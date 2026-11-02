import { useEffect, useRef } from 'react';
import Editor, { OnMount, BeforeMount } from '@monaco-editor/react';
import { useWorkspaceStore } from '../../stores/workspace.store.js';
import { Loader2 } from 'lucide-react';

export function CodeEditor() {
  const activeFilePath = useWorkspaceStore((state) => state.activeFilePath);
  const files = useWorkspaceStore((state) => state.files);
  const updateFileContent = useWorkspaceStore((state) => state.updateFileContent);
  const saveFile = useWorkspaceStore((state) => state.saveFile);
  const saveViewState = useWorkspaceStore((state) => state.saveViewState);

  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const previousPathRef = useRef<string | null>(null);

  const activeFile = activeFilePath ? files[activeFilePath] : null;

  // Save view state of previous file when active file changes
  useEffect(() => {
    if (editorRef.current && previousPathRef.current && previousPathRef.current !== activeFilePath) {
      const currentViewState = editorRef.current.saveViewState();
      if (currentViewState) {
        saveViewState(previousPathRef.current, currentViewState);
      }
    }
    previousPathRef.current = activeFilePath;
  }, [activeFilePath, saveViewState]);

  // Restore view state for newly activated file
  useEffect(() => {
    if (editorRef.current && activeFile?.viewState) {
      editorRef.current.restoreViewState(activeFile.viewState);
      editorRef.current.focus();
    }
  }, [activeFilePath]);

  const handleEditorBeforeMount: BeforeMount = (monaco) => {
    // Configure Monaco JavaScript/TypeScript Compiler Options (Domain 7 LSP Intelligence)
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ESNext,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.CommonJS,
      noEmit: true,
      esModuleInterop: true,
      jsx: monaco.languages.typescript.JsxEmit.React,
      reactNamespace: 'React',
      allowJs: true,
    });

    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
    });
  };

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Add Keybinding for Ctrl+S / Cmd+S immediate manual save
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (activeFilePath) {
        saveFile(activeFilePath);
      }
    });

    // Restore saved view state if available
    if (activeFile?.viewState) {
      editor.restoreViewState(activeFile.viewState);
    }
    editor.focus();
  };

  const handleContentChange = (value: string | undefined) => {
    if (value !== undefined && activeFilePath) {
      updateFileContent(activeFilePath, value);
    }
  };

  if (!activeFile) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-zinc-950 text-zinc-500">
        <p className="text-sm">Select a file from the explorer to begin editing</p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-zinc-950">
      <Editor
        height="100%"
        width="100%"
        theme="vs-dark"
        path={activeFile.path}
        defaultLanguage={activeFile.language}
        language={activeFile.language}
        value={activeFile.content}
        onChange={handleContentChange}
        beforeMount={handleEditorBeforeMount}
        onMount={handleEditorDidMount}
        loading={
          <div className="flex h-full w-full items-center justify-center gap-2 bg-zinc-950 text-zinc-400">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
            <span className="text-xs">Loading Monaco Language Engine...</span>
          </div>
        }
        options={{
          automaticLayout: true,
          fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Monaco, Consolas, monospace",
          fontSize: 13,
          lineHeight: 20,
          tabSize: 2,
          minimap: {
            enabled: true,
            scale: 1,
            renderCharacters: false,
          },
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          bracketPairColorization: {
            enabled: true,
          },
          folding: true,
          foldingHighlight: true,
          formatOnPaste: true,
          formatOnType: true,
          renderLineHighlight: 'all',
          renderWhitespace: 'selection',
          wordWrap: 'off',
          suggestOnTriggerCharacters: true,
          quickSuggestions: {
            other: true,
            comments: false,
            strings: true,
          },
        }}
      />
    </div>
  );
}
