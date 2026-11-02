export function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'json':
      return 'json';
    case 'html':
    case 'htm':
      return 'html';
    case 'css':
    case 'scss':
    case 'sass':
    case 'less':
      return 'css';
    case 'md':
    case 'markdown':
      return 'markdown';
    case 'yml':
    case 'yaml':
      return 'yaml';
    case 'sql':
      return 'sql';
    case 'sh':
    case 'bash':
      return 'shell';
    case 'dockerfile':
      return 'dockerfile';
    default:
      return 'plaintext';
  }
}

export function computeLineDiff(
  original: string,
  modified: string,
): { additions: number; deletions: number } {
  const origLines = original.split('\n');
  const modLines = modified.split('\n');

  const m = origLines.length;
  const n = modLines.length;

  // Space-optimized LCS: O(min(m, n)) memory
  const prev = new Int32Array(n + 1);
  const curr = new Int32Array(n + 1);

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (origLines[i - 1] === modLines[j - 1]) {
        curr[j] = prev[j - 1] + 1;
      } else {
        curr[j] = Math.max(prev[j], curr[j - 1]);
      }
    }
    prev.set(curr);
  }

  const lcsLength = curr[n];
  return {
    deletions: m - lcsLength,
    additions: n - lcsLength,
  };
}
