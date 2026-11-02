import { create } from 'zustand';
import {
  WorkspaceFile,
  SyncStatus,
  EditorViewMode,
  FileDiffSummary,
} from '../types/workspace.types.js';
import { getLanguageFromPath, computeLineDiff } from '../utils/language.utils.js';

interface WorkspaceState {
  sessionId: string | null;
  files: Record<string, WorkspaceFile>;
  openTabs: string[];
  activeFilePath: string | null;
  viewMode: EditorViewMode;
  syncStatus: SyncStatus;
  workspaceRevision: number;
  sidebarTab: 'explorer' | 'changes' | 'problems';
  searchQuery: string;

  // Actions
  setSessionId: (sessionId: string | null) => void;
  fetchWorkspaceFiles: (sessionId: string) => Promise<void>;
  openFile: (path: string) => void;
  closeTab: (path: string) => void;
  setActiveFile: (path: string) => void;
  setViewMode: (mode: EditorViewMode) => void;
  setSidebarTab: (tab: 'explorer' | 'changes' | 'problems') => void;
  setSearchQuery: (query: string) => void;
  updateFileContent: (path: string, content: string) => void;
  saveFile: (path: string) => Promise<void>;
  flushPendingSaves: () => Promise<void>;
  revertFile: (path: string) => void;
  receiveExternalFileChange: (path: string, newContent: string) => void;
  saveViewState: (path: string, viewState: any) => void;
  getModifiedFiles: () => FileDiffSummary[];
}

// Initial demo codebase representing the assessment repository
const INITIAL_FILES: Record<string, WorkspaceFile> = {
  'src/index.ts': {
    path: 'src/index.ts',
    name: 'index.ts',
    language: 'typescript',
    content: `import express from 'express';\nimport { orderRouter } from './controllers/order.controller.js';\n\nconst app = express();\napp.use(express.json());\n\n// Defect #1: Missing CORS headers and route mounting\napp.use('/api/orders', orderRouter);\n\nconst PORT = process.env.PORT || 3000;\napp.listen(PORT, () => {\n  console.log(\`Server running on port \${PORT}\`);\n});\n`,
    originalContent: `import express from 'express';\nimport { orderRouter } from './controllers/order.controller.js';\n\nconst app = express();\napp.use(express.json());\n\n// Defect #1: Missing CORS headers and route mounting\napp.use('/api/orders', orderRouter);\n\nconst PORT = process.env.PORT || 3000;\napp.listen(PORT, () => {\n  console.log(\`Server running on port \${PORT}\`);\n});\n`,
    isModified: false,
    isSaved: true,
    revision: 1,
  },
  'src/controllers/order.controller.ts': {
    path: 'src/controllers/order.controller.ts',
    name: 'order.controller.ts',
    language: 'typescript',
    content: `import { Router, Request, Response } from 'express';\nimport { calculateOrderTotal, processPayment } from '../services/payment.service.js';\n\nexport const orderRouter = Router();\n\norderRouter.post('/checkout', async (req: Request, res: Response) => {\n  const { items, discountCode } = req.body;\n\n  // Defect #2: Off-by-one error in discount application\n  const total = calculateOrderTotal(items, discountCode);\n  \n  // Defect #3: Missing await on payment gateway promise\n  const paymentResult = processPayment(total);\n\n  res.json({ success: true, total, payment: paymentResult });\n});\n`,
    originalContent: `import { Router, Request, Response } from 'express';\nimport { calculateOrderTotal, processPayment } from '../services/payment.service.js';\n\nexport const orderRouter = Router();\n\norderRouter.post('/checkout', async (req: Request, res: Response) => {\n  const { items, discountCode } = req.body;\n\n  // Defect #2: Off-by-one error in discount application\n  const total = calculateOrderTotal(items, discountCode);\n  \n  // Defect #3: Missing await on payment gateway promise\n  const paymentResult = processPayment(total);\n\n  res.json({ success: true, total, payment: paymentResult });\n});\n`,
    isModified: false,
    isSaved: true,
    revision: 1,
  },
  'src/services/payment.service.ts': {
    path: 'src/services/payment.service.ts',
    name: 'payment.service.ts',
    language: 'typescript',
    content: `export interface OrderItem {\n  id: string;\n  price: number;\n  quantity: number;\n}\n\nexport function calculateOrderTotal(items: OrderItem[], discountCode?: string): number {\n  let subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);\n\n  // Defect #4: Discount percentage applies inverted logic\n  if (discountCode === 'SAVE20') {\n    subtotal = subtotal * 1.2; // Bug: charges 120% instead of 80%\n  }\n\n  return Math.round(subtotal * 100) / 100;\n}\n\nexport async function processPayment(amount: number): Promise<{ transactionId: string; status: string }> {\n  return new Promise((resolve) => {\n    setTimeout(() => {\n      resolve({ transactionId: \`tx_\${Date.now()}\`, status: 'CONFIRMED' });\n    }, 200);\n  });\n}\n`,
    originalContent: `export interface OrderItem {\n  id: string;\n  price: number;\n  quantity: number;\n}\n\nexport function calculateOrderTotal(items: OrderItem[], discountCode?: string): number {\n  let subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);\n\n  // Defect #4: Discount percentage applies inverted logic\n  if (discountCode === 'SAVE20') {\n    subtotal = subtotal * 1.2; // Bug: charges 120% instead of 80%\n  }\n\n  return Math.round(subtotal * 100) / 100;\n}\n\nexport async function processPayment(amount: number): Promise<{ transactionId: string; status: string }> {\n  return new Promise((resolve) => {\n    setTimeout(() => {\n      resolve({ transactionId: \`tx_\${Date.now()}\`, status: 'CONFIRMED' });\n    }, 200);\n  });\n}\n`,
    isModified: false,
    isSaved: true,
    revision: 1,
  },
  'package.json': {
    path: 'package.json',
    name: 'package.json',
    language: 'json',
    content: `{\n  "name": "ecommerce-service",\n  "version": "1.0.0",\n  "type": "module",\n  "scripts": {\n    "start": "node dist/index.js",\n    "test": "jest"\n  },\n  "dependencies": {\n    "express": "^4.19.2"\n  }\n}\n`,
    originalContent: `{\n  "name": "ecommerce-service",\n  "version": "1.0.0",\n  "type": "module",\n  "scripts": {\n    "start": "node dist/index.js",\n    "test": "jest"\n  },\n  "dependencies": {\n    "express": "^4.19.2"\n  }\n}\n`,
    isModified: false,
    isSaved: true,
    revision: 1,
  },
  'README.md': {
    path: 'README.md',
    name: 'README.md',
    language: 'markdown',
    content: `# RepoDojo Assessment: Node.js E-Commerce Service\n\n## Objective\nIdentify, debug, and fix the 8 intentional defects across the codebase.\n\n### Running Tests\nUse the integrated terminal to run tests:\n\`\`\`bash\npnpm test\n\`\`\`\n\n### Rules\n- Do not modify test assertions.\n- Ensure all API endpoints return valid response codes.\n- Auto-save is active. Changes persist automatically.\n`,
    originalContent: `# RepoDojo Assessment: Node.js E-Commerce Service\n\n## Objective\nIdentify, debug, and fix the 8 intentional defects across the codebase.\n\n### Running Tests\nUse the integrated terminal to run tests:\n\`\`\`bash\npnpm test\n\`\`\`\n\n### Rules\n- Do not modify test assertions.\n- Ensure all API endpoints return valid response codes.\n- Auto-save is active. Changes persist automatically.\n`,
    isModified: false,
    isSaved: true,
    revision: 1,
  },
};

// Debounce timer for auto-saving
const saveTimers: Record<string, NodeJS.Timeout> = {};

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  sessionId: null,
  files: INITIAL_FILES,
  openTabs: ['src/controllers/order.controller.ts', 'src/services/payment.service.ts'],
  activeFilePath: 'src/controllers/order.controller.ts',
  viewMode: 'code',
  sidebarTab: 'explorer',
  searchQuery: '',
  workspaceRevision: 1,
  syncStatus: {
    state: 'saved',
    pendingChangesCount: 0,
    lastSavedAt: new Date(),
  },

  setSessionId: (sessionId) => set({ sessionId }),

  fetchWorkspaceFiles: async (sessionId: string) => {
    set((state) => ({
      sessionId,
      syncStatus: { ...state.syncStatus, state: 'saving' },
    }));

    try {
      const treeRes = await fetch(`/api/workspace/${sessionId}/tree`);
      if (!treeRes.ok) throw new Error('Failed to fetch workspace tree');
      const treeData = await treeRes.json();
      const treeFiles: Array<{ path: string }> = treeData.files || [];

      const newFiles: Record<string, WorkspaceFile> = {};
      for (const item of treeFiles) {
        try {
          const fileRes = await fetch(
            `/api/workspace/${sessionId}/file?path=${encodeURIComponent(item.path)}`,
          );
          if (fileRes.ok) {
            const fileData = await fileRes.json();
            const language = getLanguageFromPath(item.path);
            const name = item.path.split('/').pop() || item.path;
            newFiles[item.path] = {
              path: item.path,
              name,
              language,
              content: fileData.content || '',
              originalContent: fileData.content || '',
              isModified: false,
              isSaved: true,
              revision: fileData.revision || 1,
            };
          }
        } catch {
          // Skip individual failed file fetch
        }
      }

      if (Object.keys(newFiles).length > 0) {
        const firstPath = Object.keys(newFiles)[0];
        set({
          files: newFiles,
          openTabs: [firstPath],
          activeFilePath: firstPath,
          syncStatus: {
            state: 'saved',
            pendingChangesCount: 0,
            lastSavedAt: new Date(),
          },
        });
      }
    } catch {
      set((state) => ({
        syncStatus: { ...state.syncStatus, state: 'error' },
      }));
    }
  },

  openFile: (path: string) => {
    const { files, openTabs } = get();
    if (!files[path]) {
      // Lazily create file node if not present
      const name = path.split('/').pop() || path;
      const language = getLanguageFromPath(path);
      const newFile: WorkspaceFile = {
        path,
        name,
        content: '',
        originalContent: '',
        language,
        isModified: false,
        isSaved: true,
        revision: 1,
      };
      set({
        files: { ...files, [path]: newFile },
        openTabs: openTabs.includes(path) ? openTabs : [...openTabs, path],
        activeFilePath: path,
      });
      return;
    }

    if (!openTabs.includes(path)) {
      set({ openTabs: [...openTabs, path], activeFilePath: path });
    } else {
      set({ activeFilePath: path });
    }
  },

  closeTab: (path: string) => {
    const { openTabs, activeFilePath, files } = get();
    const newTabs = openTabs.filter((t) => t !== path);

    // Save pending changes before tab close if modified
    if (files[path]?.isModified) {
      get().saveFile(path);
    }

    let nextActive = activeFilePath;
    if (activeFilePath === path) {
      nextActive = newTabs.length > 0 ? newTabs[newTabs.length - 1] : null;
    }

    set({ openTabs: newTabs, activeFilePath: nextActive });
  },

  setActiveFile: (path: string) => {
    const { openTabs } = get();
    if (!openTabs.includes(path)) {
      set({ openTabs: [...openTabs, path], activeFilePath: path });
    } else {
      set({ activeFilePath: path });
    }
  },

  setViewMode: (mode: EditorViewMode) => set({ viewMode: mode }),
  setSidebarTab: (tab) => set({ sidebarTab: tab }),
  setSearchQuery: (query) => set({ searchQuery: query }),

  updateFileContent: (path: string, content: string) => {
    const { files } = get();
    const file = files[path];
    if (!file) return;

    const isModified = content !== file.originalContent;

    set((state) => ({
      files: {
        ...state.files,
        [path]: {
          ...file,
          content,
          isModified,
          isSaved: false,
        },
      },
      syncStatus: {
        ...state.syncStatus,
        state: 'saving',
        pendingChangesCount: Object.values(state.files).filter((f) => !f.isSaved).length + 1,
      },
    }));

    // Debounced Auto-Save (500ms after user pauses typing - PRD §7.4)
    if (saveTimers[path]) {
      clearTimeout(saveTimers[path]);
    }

    saveTimers[path] = setTimeout(() => {
      get().saveFile(path);
    }, 500);
  },

  saveFile: async (path: string) => {
    const { files, workspaceRevision, sessionId } = get();
    const file = files[path];
    if (!file) return;

    if (saveTimers[path]) {
      clearTimeout(saveTimers[path]);
      delete saveTimers[path];
    }

    let nextRevision = workspaceRevision + 1;

    if (sessionId) {
      try {
        const res = await fetch(`/api/workspace/${sessionId}/file`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path, content: file.content }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.revision) nextRevision = data.revision;
        }
      } catch (err) {
        console.error('Failed to persist file to workspace API:', err);
      }
    }

    set((state) => ({
      files: {
        ...state.files,
        [path]: {
          ...file,
          isSaved: true,
          revision: nextRevision,
        },
      },
      workspaceRevision: nextRevision,
      syncStatus: {
        state: 'saved',
        pendingChangesCount: 0,
        lastSavedAt: new Date(),
      },
    }));
  },

  flushPendingSaves: async () => {
    // Immediately clear all timers and flush modified files
    Object.keys(saveTimers).forEach((path) => {
      clearTimeout(saveTimers[path]);
      delete saveTimers[path];
    });

    const { files } = get();
    for (const [path, file] of Object.entries(files)) {
      if (!file.isSaved) {
        await get().saveFile(path);
      }
    }
  },

  revertFile: (path: string) => {
    const { files } = get();
    const file = files[path];
    if (!file) return;

    set((state) => ({
      files: {
        ...state.files,
        [path]: {
          ...file,
          content: file.originalContent,
          isModified: false,
          isSaved: true,
        },
      },
    }));
  },

  receiveExternalFileChange: (path: string, newContent: string) => {
    const { files } = get();
    const file = files[path];

    // If candidate has unsaved local edits, avoid overwriting
    if (file && file.isModified && !file.isSaved) {
      console.warn(`Terminal conflict detected for ${path}: preserving candidate edits.`);
      return;
    }

    if (file) {
      set((state) => ({
        files: {
          ...state.files,
          [path]: {
            ...file,
            content: newContent,
            isModified: newContent !== file.originalContent,
            isSaved: true,
          },
        },
      }));
    }
  },

  saveViewState: (path: string, viewState: any) => {
    const { files } = get();
    const file = files[path];
    if (!file) return;

    set((state) => ({
      files: {
        ...state.files,
        [path]: {
          ...file,
          viewState,
        },
      },
    }));
  },

  getModifiedFiles: (): FileDiffSummary[] => {
    const { files } = get();
    const diffs: FileDiffSummary[] = [];

    for (const file of Object.values(files)) {
      if (file.isModified) {
        const { additions, deletions } = computeLineDiff(file.originalContent, file.content);
        diffs.push({
          path: file.path,
          status: 'modified',
          additions,
          deletions,
        });
      }
    }

    return diffs;
  },
}));
