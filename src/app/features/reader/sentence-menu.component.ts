import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { SentenceAids } from '../../application/enrichment/sentence-aids.store';
import type { ReadingKind } from '../../domain/reading/reading';

export type SentenceMenuActionId =
  'toggle-translation' | 'translate' | 'analyze-grammar' | 'details';

export interface SentenceMenuAction {
  readonly id: SentenceMenuActionId;
  readonly label: string;
  /** Shown under the label when the entry needs a word of explanation. */
  readonly hint?: string;
  readonly busy?: boolean;
}

/**
 * What the sentence menu offers for one sentence.
 *
 * An array rather than a fixed template, so Milestone 9's sentence audio slots
 * in as one more entry instead of another branch in a growing template.
 */
export function sentenceMenuActions(
  aids: SentenceAids,
  readingKind: ReadingKind,
): readonly SentenceMenuAction[] {
  const actions: SentenceMenuAction[] = [];

  if (aids.translation !== null) {
    actions.push({
      id: 'toggle-translation',
      label: aids.translationVisible ? 'Hide translation' : 'Show translation',
    });
  }

  if (aids.translationAction.state === 'running') {
    actions.push({ id: 'translate', label: 'Translating…', busy: true });
  } else if (aids.translationAction.state === 'failed') {
    actions.push({ id: 'translate', label: 'Retry translation' });
  } else if (aids.translation === null) {
    actions.push({
      id: 'translate',
      label: 'Translate sentence',
      hint: 'Sends this one sentence to your text model.',
    });
  }

  // Generated stories are reviewed once, against the profile captured with
  // them; re-analysing one would judge frozen text by a profile it was never
  // written for.
  if (readingKind === 'imported') {
    if (aids.grammarAction.state === 'running') {
      actions.push({ id: 'analyze-grammar', label: 'Analyzing grammar…', busy: true });
    } else if (aids.grammarAction.state === 'failed') {
      actions.push({ id: 'analyze-grammar', label: 'Retry grammar analysis' });
    } else if (aids.grammar === null) {
      actions.push({
        id: 'analyze-grammar',
        label: 'Analyze grammar',
        hint: 'Sends this one sentence to your text model.',
      });
    } else if (aids.grammarStale) {
      actions.push({
        id: 'analyze-grammar',
        label: 'Re-analyze grammar',
        hint: 'Your grammar profile changed since this was analyzed.',
      });
    }
  }

  actions.push({ id: 'details', label: 'Sentence details' });
  return actions;
}

/**
 * The floating menu of sentence actions.
 *
 * Plain buttons in a list rather than a `menu` role: the popover it lives in is
 * already a dialog, and nesting a menu inside one gives a screen reader two
 * widget models to reconcile for four ordinary actions.
 */
@Component({
  selector: 'mn-sentence-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="menu">
      @for (action of actions(); track action.id) {
        <li>
          <button type="button" [disabled]="action.busy === true" (click)="chosen.emit(action.id)">
            <span class="label">{{ action.label }}</span>
            @if (action.hint; as hint) {
              <span class="mn-hint">{{ hint }}</span>
            }
          </button>
        </li>
      }
    </ul>
  `,
  styles: `
    .menu {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    button {
      display: flex;
      flex-direction: column;
      gap: 2px;
      width: 100%;
      min-height: var(--touch-target);
      padding: var(--space-2) var(--space-3);
      border: 0;
      border-radius: var(--radius-control);
      background: none;
      color: var(--text-primary);
      font: inherit;
      text-align: start;
      cursor: pointer;
    }

    button:hover:not(:disabled),
    button:focus-visible {
      background: var(--surface-sunken);
    }

    button:disabled {
      color: var(--text-secondary);
      cursor: default;
    }

    .label {
      font-weight: 500;
    }
  `,
})
export class SentenceMenuComponent {
  readonly actions = input.required<readonly SentenceMenuAction[]>();

  readonly chosen = output<SentenceMenuActionId>();
}
