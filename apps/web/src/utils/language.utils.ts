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

export function computeLineDiff(original: string, modified: string): { additions: number; deletions: number } {
  const origLines = original.split('\n');
  const modLines = modified.split('\n');

  let additions = 0;
  let deletions = 0;

  // Simple quick diff count for UI indicators
  const origSet = new Set(origLines);
  const modSet = new Set(modLines);

  for (const line of modLines) {
    if (!origSet.has(line)) additions++;
  }

  for (const line of origLines) {
    if (!modSet.has(line)) deletions++;
  }

  return { additions, deletions };
}
