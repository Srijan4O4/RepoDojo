import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkspaceStore } from '../workspace.store.js';
import { computeLineDiff } from '../../utils/language.utils.js';

describe('Domain 7: Candidate Web IDE Workspace Store', () => {
  beforeEach(() => {
    // Reset store to known state
    const state = useWorkspaceStore.getState();
    state.openFile('src/controllers/order.controller.ts');
  });

  it('should initialize with default workspace files and open tabs', () => {
    const state = useWorkspaceStore.getState();
    expect(state.files['src/controllers/order.controller.ts']).toBeDefined();
    expect(state.files['src/services/payment.service.ts']).toBeDefined();
    expect(state.openTabs.length).toBeGreaterThan(0);
    expect(state.activeFilePath).toBe('src/controllers/order.controller.ts');
  });

  it('should open new files and switch active tabs', () => {
    const { openFile } = useWorkspaceStore.getState();
    openFile('README.md');

    const state = useWorkspaceStore.getState();
    expect(state.openTabs).toContain('README.md');
    expect(state.activeFilePath).toBe('README.md');
  });

  it('should close tab and activate remaining tab', () => {
    const { openFile, closeTab } = useWorkspaceStore.getState();
    openFile('package.json');
    openFile('README.md');

    closeTab('README.md');
    const state = useWorkspaceStore.getState();
    expect(state.openTabs).not.toContain('README.md');
    expect(state.activeFilePath).toBe('package.json');
  });

  it('should mark file as modified and calculate diffs on edit', () => {
    const { updateFileContent, getModifiedFiles } = useWorkspaceStore.getState();
    const testPath = 'src/controllers/order.controller.ts';

    updateFileContent(testPath, '// Fix for Defect #2: corrected discount math\nconst fixed = true;\n');

    const state = useWorkspaceStore.getState();
    const file = state.files[testPath];
    expect(file.isModified).toBe(true);
    expect(file.isSaved).toBe(false);

    const modifiedList = getModifiedFiles();
    expect(modifiedList.some((m) => m.path === testPath)).toBe(true);
  });

  it('should save file and increment workspace revision', async () => {
    const { updateFileContent, saveFile } = useWorkspaceStore.getState();
    const testPath = 'src/controllers/order.controller.ts';

    updateFileContent(testPath, 'const updated = 123;');
    const prevRev = useWorkspaceStore.getState().workspaceRevision;

    await saveFile(testPath);

    const state = useWorkspaceStore.getState();
    expect(state.files[testPath].isSaved).toBe(true);
    expect(state.workspaceRevision).toBeGreaterThan(prevRev);
    expect(state.syncStatus.state).toBe('saved');
  });

  it('should flush all pending saves immediately', async () => {
    const { updateFileContent, flushPendingSaves } = useWorkspaceStore.getState();
    updateFileContent('src/index.ts', 'const server = 1;');
    updateFileContent('src/services/payment.service.ts', 'const pay = 2;');

    await flushPendingSaves();

    const state = useWorkspaceStore.getState();
    expect(state.files['src/index.ts'].isSaved).toBe(true);
    expect(state.files['src/services/payment.service.ts'].isSaved).toBe(true);
  });

  it('should revert file to original starter baseline', () => {
    const { updateFileContent, revertFile } = useWorkspaceStore.getState();
    const testPath = 'src/controllers/order.controller.ts';
    const original = useWorkspaceStore.getState().files[testPath].originalContent;

    updateFileContent(testPath, 'completely corrupted code');
    expect(useWorkspaceStore.getState().files[testPath].isModified).toBe(true);

    revertFile(testPath);

    const state = useWorkspaceStore.getState();
    expect(state.files[testPath].content).toBe(original);
    expect(state.files[testPath].isModified).toBe(false);
  });

  it('should preserve candidate local unsaved edits when external file change is received', () => {
    const { updateFileContent, receiveExternalFileChange } = useWorkspaceStore.getState();
    const testPath = 'src/controllers/order.controller.ts';

    updateFileContent(testPath, 'local candidate work in progress');

    // External change from terminal (e.g. git checkout or build tool)
    receiveExternalFileChange(testPath, 'terminal changed file');

    // Candidate edits must NOT be clobbered
    const state = useWorkspaceStore.getState();
    expect(state.files[testPath].content).toBe('local candidate work in progress');
  });

  it('should compute line diff accurately without collapsing duplicate lines via LCS', () => {
    const orig = 'line 1\n\nline 2\n\nline 3';
    const mod = 'line 1\n\nline 2 (edited)\n\nline 3\n\nline 4';
    const diff = computeLineDiff(orig, mod);
    expect(diff.deletions).toBe(1);
    expect(diff.additions).toBe(3);
  });

  it('should set and retrieve sessionId for active workspace', () => {
    const { setSessionId } = useWorkspaceStore.getState();
    setSessionId('test-sess-1234');
    expect(useWorkspaceStore.getState().sessionId).toBe('test-sess-1234');
  });
});
