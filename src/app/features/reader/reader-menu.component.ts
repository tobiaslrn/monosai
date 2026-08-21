import type { ElementRef } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  viewChild,
} from '@angular/core';
import type { Reading } from '../../domain/reading/reading';
import { IconComponent } from '../../shared-ui/icon/icon.component';

/**
 * The reader's overflow menu.
 *
 * What is left of it: translating the reading, and deleting it. Audio moved out
 * to its own header button, and the per-button explanations went with the rest
 * of the reader's prose — the labels are the whole message.
 *
 * A native popover anchored to its own button: `Escape`, a press outside, the
 * top layer, and closing when the Aids panel opens are all the platform's
 * behaviour rather than listeners of our own.
 */
@Component({
  selector: 'mn-reader-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div>
      <button
        type="button"
        class="mn-icon-button anchor-button"
        aria-label="Reading actions"
        popovertarget="mn-reader-menu-panel"
      >
        <mn-icon name="overflow" />
      </button>

      <div
        #panel
        id="mn-reader-menu-panel"
        popover
        class="panel"
        role="group"
        aria-label="Reading actions"
      >
        @if (isRunning()) {
          <button type="button" (click)="choose(cancelled)">Stop translating</button>
        } @else if (missingCount() > 0) {
          <button type="button" (click)="choose(translateAll)">Translate reading</button>
        }

        <button type="button" class="danger" (click)="choose(deleteRequested)">
          Delete reading
        </button>
      </div>
    </div>
  `,
  styles: `
    .anchor-button {
      anchor-name: --mn-reader-menu-anchor;
    }

    /*
     * Positioned against the button rather than a wrapper, because a popover
     * is in the top layer and no longer has an ancestor to be absolute inside.
     */
    .panel {
      position: absolute;
      position-anchor: --mn-reader-menu-anchor;
      /*
       * All-physical keywords: position-area refuses a mix of physical and
       * logical ones. The popover user-agent style pins inset to zero to centre
       * a dialog, which has to be released before the area applies.
       */
      position-area: bottom span-left;
      inset: auto;
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      width: min(20rem, calc(100vw - 2 * var(--space-4)));
      margin: var(--space-2) 0 0;
      padding: var(--space-2);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-card);
      background: var(--surface-panel);
      box-shadow: var(--shadow-overlay);
    }

    .panel:not(:popover-open) {
      display: none;
    }

    .panel button {
      display: flex;
      align-items: center;
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

    .panel button:hover,
    .panel button:focus-visible {
      background: var(--surface-sunken);
    }

    .panel .danger {
      color: var(--status-danger);
    }
  `,
})
export class ReaderMenuComponent {
  readonly reading = input.required<Reading>();
  readonly isRunning = input(false);

  readonly translateAll = output<void>();
  readonly cancelled = output<void>();
  readonly deleteRequested = output<void>();

  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');

  /** Sentences with no current translation, from the reading's stored summary. */
  protected readonly missingCount = computed(() => {
    const summary = this.reading().translationSummary;
    return Math.max(summary.total - summary.completed, 0);
  });

  /** Chosen entries close the menu; dismissal without choosing is the platform's. */
  protected choose(action: { emit: () => void }): void {
    this.panel().nativeElement.hidePopover();
    action.emit();
  }
}
