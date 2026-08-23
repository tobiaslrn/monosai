import type { ElementRef } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { DraftSentence } from '../../domain/reading/import-draft';
import { IconComponent } from '../../shared-ui/icon/icon.component';

export interface SentenceSplitRequest {
  readonly sentenceId: string;
  readonly offsetUtf16: number;
}

export interface SentenceMergeRequest {
  readonly sentenceId: string;
  readonly direction: 'previous' | 'next';
}

/**
 * One reviewable sentence.
 *
 * The text stays in a read-only text box because splitting needs a caret the
 * learner can place with the keyboard as well as the mouse. It cannot be
 * edited: review corrects boundaries, and changing the text itself means going
 * back to raw input, which keeps saved text and tokens coherent.
 */
@Component({
  selector: 'mn-review-sentence',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  host: {
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
    '(keydown.escape)': 'onEscape($event)',
  },
  template: `
    <div class="row" [class.is-pending]="sentence().tokens === null">
      <span class="ordinal" aria-hidden="true">{{ ordinal() }}</span>

      <textarea
        #text
        class="text"
        lang="ja"
        readonly
        rows="1"
        [attr.aria-label]="'Sentence ' + ordinal()"
        [attr.aria-readonly]="'true'"
        [attr.aria-describedby]="descriptionId()"
        [value]="sentence().text"
        (keydown)="onKeydown($event)"
      ></textarea>
      <span [id]="descriptionId()" class="mn-visually-hidden">
        Read-only sentence text. Use the Actions menu to split or merge sentence boundaries.
      </span>

      <div #actions class="actions">
        <button
          #toggle
          type="button"
          class="toggle"
          aria-haspopup="menu"
          [attr.aria-controls]="menuId()"
          [attr.aria-expanded]="menuOpen()"
          [attr.aria-label]="'Actions for sentence ' + ordinal()"
          (click)="toggleMenu()"
        >
          <mn-icon name="overflow" [size]="20" />
        </button>

        @if (menuOpen()) {
          <div
            class="menu"
            role="menu"
            [id]="menuId()"
            [attr.aria-label]="'Sentence ' + ordinal() + ' actions'"
          >
            <button type="button" role="menuitem" (click)="requestSplit()">
              <mn-icon name="split" [size]="18" />
              <span>Split at cursor</span>
            </button>
            <button
              type="button"
              role="menuitem"
              [disabled]="isFirst()"
              (click)="requestMerge('previous')"
            >
              <mn-icon name="merge" [size]="18" />
              <span>Merge with previous</span>
            </button>
            <button
              type="button"
              role="menuitem"
              [disabled]="isLast()"
              (click)="requestMerge('next')"
            >
              <mn-icon name="merge" [size]="18" />
              <span>Merge with next</span>
            </button>
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    .row {
      display: flex;
      gap: var(--space-2);
      align-items: flex-start;
      padding: var(--space-2);
      border-radius: var(--radius-control);
    }

    .row:focus-within {
      background: var(--surface-sunken);
    }

    .row.is-pending .text {
      opacity: 0.6;
    }

    .ordinal {
      min-width: 2ch;
      padding-top: 0.35em;
      color: var(--text-secondary);
      font-size: var(--text-sm);
      text-align: right;
    }

    .text {
      flex: 1;
      min-width: 0;
      padding: var(--space-2);
      border: 1px solid transparent;
      border-radius: var(--radius-control);
      background: transparent;
      color: var(--text-primary);
      font-family: var(--font-japanese);
      font-size: var(--text-lg);
      line-height: 1.8;
      resize: none;
      field-sizing: content;
    }

    .text:focus-visible {
      border-color: var(--border-strong);
    }

    .actions {
      position: relative;
      flex: none;
    }

    .toggle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: var(--touch-target);
      height: var(--touch-target);
      border: 1px solid transparent;
      border-radius: var(--radius-control);
      background: transparent;
      color: var(--text-secondary);
      cursor: pointer;
    }

    .toggle:hover {
      border-color: var(--border-subtle);
    }

    .menu {
      position: absolute;
      z-index: 2;
      inset-inline-end: 0;
      display: flex;
      flex-direction: column;
      min-width: 15rem;
      padding: var(--space-1);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-control);
      background: var(--surface-raised);
      box-shadow: var(--shadow-overlay);
    }

    .menu button {
      display: flex;
      gap: var(--space-2);
      align-items: center;
      min-height: var(--touch-target);
      padding: var(--space-2) var(--space-3);
      border: 0;
      border-radius: var(--radius-control);
      background: transparent;
      color: var(--text-primary);
      font: inherit;
      text-align: start;
      cursor: pointer;
    }

    .menu button:hover:not(:disabled) {
      background: var(--surface-sunken);
    }

    .menu button:disabled {
      color: var(--text-secondary);
      cursor: not-allowed;
    }
  `,
})
export class ReviewSentenceComponent {
  readonly sentence = input.required<DraftSentence>();
  readonly index = input.required<number>();
  readonly total = input.required<number>();

  readonly split = output<SentenceSplitRequest>();
  readonly merge = output<SentenceMergeRequest>();

  private readonly textArea = viewChild.required<ElementRef<HTMLTextAreaElement>>('text');
  private readonly toggleButton = viewChild.required<ElementRef<HTMLButtonElement>>('toggle');
  private readonly actions = viewChild.required<ElementRef<HTMLElement>>('actions');

  private readonly menuOpenSignal = signal(false);
  protected readonly menuOpen = this.menuOpenSignal.asReadonly();
  protected readonly menuId = computed(() => `mn-sentence-actions-${this.sentence().id}`);
  protected readonly descriptionId = computed(
    () => `mn-sentence-description-${this.sentence().id}`,
  );

  protected readonly ordinal = computed(() => this.index() + 1);
  protected readonly isFirst = computed(() => this.index() === 0);
  protected readonly isLast = computed(() => this.index() === this.total() - 1);

  protected toggleMenu(): void {
    this.menuOpenSignal.update((open) => !open);
  }

  protected onDocumentPointerDown(event: PointerEvent): void {
    if (
      this.menuOpenSignal() &&
      event.target instanceof Node &&
      !this.actions().nativeElement.contains(event.target)
    ) {
      this.closeMenu(false);
    }
  }

  protected onEscape(event: Event): void {
    if (!this.menuOpenSignal()) {
      return;
    }
    event.preventDefault();
    this.closeMenu();
  }

  /** Ctrl+Enter splits without leaving the text, which keeps the caret in place. */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.requestSplit();
      return;
    }
    if (event.key === 'Escape' && this.menuOpenSignal()) {
      this.closeMenu();
    }
  }

  protected requestSplit(): void {
    this.closeMenu();
    this.split.emit({
      sentenceId: this.sentence().id,
      offsetUtf16: this.textArea().nativeElement.selectionStart,
    });
  }

  protected requestMerge(direction: 'previous' | 'next'): void {
    this.closeMenu();
    this.merge.emit({ sentenceId: this.sentence().id, direction });
  }

  private closeMenu(returnFocus = true): void {
    if (!this.menuOpenSignal()) {
      return;
    }
    this.menuOpenSignal.set(false);
    if (returnFocus) {
      this.toggleButton().nativeElement.focus();
    }
  }
}
