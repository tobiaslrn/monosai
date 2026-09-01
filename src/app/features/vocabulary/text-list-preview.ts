import { formatCountOf } from '../../domain/shared/locale';
import type { ParsedTextList } from '../../domain/vocabulary/text-list-parser';

/** One grammatical, normalized summary for the pasted-list editor. */
export function textListPreviewLabel(parsed: ParsedTextList): string {
  const parts = [formatCountOf(parsed.entries.length, 'non-empty entry', 'non-empty entries')];
  if (parsed.duplicateLines > 0) {
    parts.push(`${formatCountOf(parsed.duplicateLines, 'exact duplicate')} will be merged`);
  }
  if (parsed.ignoredBlankLines > 0) {
    parts.push(`${formatCountOf(parsed.ignoredBlankLines, 'blank line')} ignored`);
  }
  return parts.join(' · ');
}
