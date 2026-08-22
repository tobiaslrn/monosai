export interface ParsedTextList {
  readonly normalizedContent: string;
  readonly entries: readonly string[];
  readonly ignoredBlankLines: number;
  readonly duplicateLines: number;
}

/** Parses one literal vocabulary expression per line. */
export function parseTextList(content: string): ParsedTextList {
  const lines = content.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
  const entries: string[] = [];
  const seen = new Set<string>();
  let ignoredBlankLines = 0;
  let duplicateLines = 0;

  for (const line of lines) {
    const entry = line.trim();
    if (entry.length === 0) {
      ignoredBlankLines += 1;
      continue;
    }
    if (seen.has(entry)) {
      duplicateLines += 1;
    } else {
      seen.add(entry);
    }
    entries.push(entry);
  }

  return {
    normalizedContent: entries.join('\n'),
    entries,
    ignoredBlankLines,
    duplicateLines,
  };
}
