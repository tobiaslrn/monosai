import type { BusyWork } from '../../domain/shared/busy-work';
import { formatCount } from '../../domain/shared/locale';

/**
 * What a pressed Reload is waiting for, as a short phrase for the status line
 * beside it: "Waiting for story", "Waiting for 2 stories".
 */
export function waitingForWork(work: BusyWork): string {
  switch (work.kind) {
    case 'story-generation':
      return work.count === 1
        ? 'Waiting for story'
        : `Waiting for ${formatCount(work.count)} stories`;
    case 'unsaved-story':
      return work.count === 1
        ? 'Waiting for unsaved story'
        : `Waiting for ${formatCount(work.count)} unsaved stories`;
    case 'package-import':
      return 'Waiting for Anki import';
    case 'import-draft':
      return 'Waiting for pasted text';
  }
}

/** The same work as one line of what a reload would discard. */
export function busyWorkLine(work: BusyWork): string {
  switch (work.kind) {
    case 'story-generation':
      return work.count === 1
        ? 'A story is being generated'
        : `${formatCount(work.count)} stories are being generated`;
    case 'unsaved-story':
      return work.count === 1
        ? 'A written story is unsaved'
        : `${formatCount(work.count)} written stories are unsaved`;
    case 'package-import':
      return 'An Anki package is being imported';
    case 'import-draft':
      return 'An import draft is unsaved';
  }
}
