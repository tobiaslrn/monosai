import type { BusyWork, HoldingWork } from '../../domain/shared/busy-work';
import { formatCount } from '../../domain/shared/locale';
import type { ConfirmDialogData } from '../confirm-dialog/confirm-dialog.component';

/**
 * What a pressed Reload is waiting for, as a short phrase for the status line
 * beside it: "Waiting for the story", "Waiting for 2 stories".
 */
export function waitingForWork(work: HoldingWork): string {
  switch (work.kind) {
    case 'story-generation':
      return work.count === 1
        ? 'Waiting for the story'
        : `Waiting for ${formatCount(work.count)} stories`;
    case 'package-import':
      return 'Waiting for Anki import';
    case 'import-draft':
      return 'Waiting for pasted text';
  }
}

/**
 * The question a Reload asks before it loses written stories whose save
 * failed. They never finish by themselves, so a reload does not wait for them:
 * it asks once nothing else holds it, and the safe answer keeps them.
 */
export function unsavedStoryReload(count: number): ConfirmDialogData {
  const one = count === 1;
  return {
    title: one
      ? 'Reload and lose the new story?'
      : `Reload and lose ${formatCount(count)} new stories?`,
    message: one
      ? 'Saving it failed, so only this tab has it.'
      : 'Saving them failed, so only this tab has them.',
    confirmLabel: 'Reload',
    cancelLabel: one ? 'Keep story' : 'Keep stories',
    tone: 'danger',
  };
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
      return 'Pasted text is unsaved';
  }
}
