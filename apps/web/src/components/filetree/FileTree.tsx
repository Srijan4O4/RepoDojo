import { useState, useMemo } from 'react';
import { useWorkspaceStore } from '../../stores/workspace.store.js';
import { Folder, FolderOpen, FileCode, FileJson, FileText, ChevronRight, ChevronDown, Search } from 'lucide-react';
import { FileTreeNode } from '../../types/workspace.types.js';

export function FileTree() {
  const files = useWorkspaceStore((state) => state.files);
  const activeFilePath = useWorkspaceStore((state) => state.activeFilePath);
  const openFile = useWorkspaceStore((state) => state.openFile);
  const searchQuery = useWorkspaceStore((state) => state.searchQuery);
  const setSearchQuery = useWorkspaceStore((state) => state.setSearchQuery);

  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    src: true,
    'src/controllers': true,
    'src/services': true,
  });

  const toggleFolder = (folderPath: string) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [folderPath]: !prev[folderPath],
    }));
  };

  // Build recursive tree data structure from flat paths in store
  const tree = useMemo(() => {
    const root: FileTreeNode[] = [];

    Object.values(files).forEach((file) => {
      if (searchQuery && !file.path.toLowerCase().includes(searchQuery.toLowerCase())) {
        return;
      }

      const parts = file.path.split('/');
      let currentLevel = root;
      let currentPath = '';

      parts.forEach((part, index) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const isFile = index === parts.length - 1;

        let existing = currentLevel.find((node) => node.name === part);

        if (!existing) {
          const newNode: FileTreeNode = {
            id: currentPath,
            name: part,
            path: currentPath,
            type: isFile ? 'file' : 'directory',
            children: isFile ? undefined : [],
            isModified: file.isModified,
          };
          currentLevel.push(newNode);
          existing = newNode;
        } else if (file.isModified) {
          existing.isModified = true;
        }

        if (!isFile && existing.children) {
          currentLevel = existing.children;
        }
      });
    });

    return root;
  }, [files, searchQuery]);

  const getFileIcon = (fileName: string) => {
    if (fileName.endsWith('.ts') || fileName.endsWith('.tsx') || fileName.endsWith('.js')) {
      return <FileCode className="h-4 w-4 text-indigo-400 shrink-0" />;
    }
    if (fileName.endsWith('.json')) {
      return <FileJson className="h-4 w-4 text-amber-400 shrink-0" />;
    }
    return <FileText className="h-4 w-4 text-zinc-400 shrink-0" />;
  };

  const renderNodes = (nodes: FileTreeNode[], depth = 0) => {
    return nodes.map((node) => {
      const isExpanded = expandedFolders[node.path];
      const isActive = activeFilePath === node.path;

      if (node.type === 'directory') {
        return (
          <div key={node.path}>
            <div
              onClick={() => toggleFolder(node.path)}
              style={{ paddingLeft: `${depth * 12 + 8}px` }}
              className="flex h-7 cursor-pointer items-center gap-1.5 text-xs text-zinc-300 hover:bg-zinc-800/60 hover:text-zinc-100 transition"
            >
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
              )}
              {isExpanded ? (
                <FolderOpen className="h-4 w-4 text-amber-500/80 shrink-0" />
              ) : (
                <Folder className="h-4 w-4 text-amber-500/80 shrink-0" />
              )}
              <span className="truncate">{node.name}</span>
            </div>
            {isExpanded && node.children && renderNodes(node.children, depth + 1)}
          </div>
        );
      }

      return (
        <div
          key={node.path}
          onClick={() => openFile(node.path)}
          style={{ paddingLeft: `${depth * 12 + 20}px` }}
          className={`flex h-7 cursor-pointer items-center justify-between pr-3 text-xs transition ${
            isActive
              ? 'bg-indigo-600/20 text-indigo-200 font-medium'
              : 'text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200'
          }`}
        >
          <div className="flex items-center gap-2 truncate">
            {getFileIcon(node.name)}
            <span className="truncate">{node.name}</span>
          </div>

          {node.isModified && (
            <span
              className="h-1.5 w-1.5 rounded-full bg-amber-400"
              title="Modified from starter"
            />
          )}
        </div>
      );
    });
  };

  return (
    <div className="flex h-full flex-col bg-zinc-900/50 select-none">
      {/* File Search Filter */}
      <div className="p-2 border-b border-zinc-800">
        <div className="flex items-center gap-2 rounded bg-zinc-950 px-2 py-1 border border-zinc-800">
          <Search className="h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent text-xs text-zinc-200 placeholder-zinc-500 outline-none"
          />
        </div>
      </div>

      {/* Tree Content */}
      <div className="flex-1 overflow-y-auto py-1">
        {tree.length === 0 ? (
          <div className="p-4 text-center text-xs text-zinc-500">No matching files</div>
        ) : (
          renderNodes(tree)
        )}
      </div>
    </div>
  );
}
