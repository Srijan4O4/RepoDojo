export interface WorkspaceFile {
  path: string;
  name: string;
  content: string;
  originalContent: string;
  language: string;
  isModified: boolean;
  isSaved: boolean;
  revision: number;
  viewState?: any;
}

export interface FileTreeNode {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
  isExpanded?: boolean;
  isModified?: boolean;
}

export type ChangeStatus = 'modified' | 'added' | 'deleted';

export interface FileDiffSummary {
  path: string;
  status: ChangeStatus;
  additions: number;
  deletions: number;
}

export type SyncState = 'idle' | 'saving' | 'saved' | 'offline' | 'error';

export interface SyncStatus {
  state: SyncState;
  pendingChangesCount: number;
  lastSavedAt?: Date;
  errorMessage?: string;
}

export type EditorViewMode = 'code' | 'diff';
