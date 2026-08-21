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
 * Everything that acts on the whole reading rather than on one sentence lives
 * here — which is the whole reason the page above it can be nothing but
 * Japanese. Whole-reading translation in particular is a real cost, so it is a
 * menu entry that says how much is missing rather than a strip that sat over
 * the text reporting on itself.
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
        class="icon-button anchor-button"
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
          <button type="button" (click)="choose(cancelled)">
            <span class="label">Stop translating</span>
            <span class="mn-hint">Sentences already translated are kept.</span>
          </button>
        } @else if (missingCount() > 0) {
          <button type="button" (click)="choose(translateAll)">
            <span class="label">{{ translateLabel() }}</span>
            <span class="mn-hint">Sends every untranslated sentence to your text model.</span>
          </button>
        } @else {
          <p class="mn-hint done">Every sentence is translated.</p>
        }

        <!--
          Audio, the second whole-reading job. Preparing spends money per
          sentence and is named with the count it would send, exactly as
          translation is; playing spends nothing and is offered only once the
          whole set exists, because a player that stopped in the middle of a
          reading would be worse than no player.
        -->
        @if (audioRunning()) {
          <button type="button" (click)="choose(cancelAudio)">
            <span class="label">Stop preparing audio</span>
            <span class="mn-hint">Sentences already read aloud are kept.</span>
          </button>
        } @else if (audioMissingCount() > 0) {
          <button type="button" (click)="choose(prepareAudio)">
            <span class="label">{{ audioLabel() }}</span>
            <span class="mn-hint">Sends every sentence without audio to your speech model.</span>
          </button>
        }

        @if (canPlayAudio()) {
          <button type="button" (click)="choose(playReading)">
            <span class="label">Play reading</span>
            <span class="mn-hint">Reads the whole reading aloud from saved audio.</span>
          </button>
        }

        <button type="button" class="danger" (click)="choose(deleteRequested)">
          <span class="label">Delete reading</span>
        </button>
      </div>
    </div>
  `,
  styles: `
    .anchor-button {
      anchor-name: --mn-reader-menu-anchor;
    }

    .icon-button {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: var(--touch-target);
      height: var(--touch-target);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-control);
      background: var(--surface-raised);
      color: var(--text-primary);
      cursor: pointer;
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

    .panel button:hover,
    .panel button:focus-visible {
      background: var(--surface-sunken);
    }

    .danger .label {
      color: var(--status-danger);
    }

    .label {
      font-weight: 500;
    }

    .done {
      margin: 0;
      padding: var(--space-2) var(--space-3);
    }
  `,
})
export class ReaderMenuComponent {
  readonly reading = input.required<Reading>();
  readonly isRunning = input(false);
  readonly audioRunning = input(false);
  /** The complete-set gate, resolved by the playback store the reader owns. */
  readonly canPlayAudio = input(false);

  readonly translateAll = output<void>();
  readonly cancelled = output<void>();
  readonly prepareAudio = output<void>();
  readonly cancelAudio = output<void>();
  readonly playReading = output<void>();
  readonly deleteRequested = output<void>();

  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');

  /** Sentences with no current translation, from the reading's stored summary. */
  protected readonly missingCount = computed(() => {
    const summary = this.reading().translationSummary;
    return Math.max(summary.total - summary.completed, 0);
  });

  protected readonly translateLabel = computed(() => {
    const missing = this.missingCount();
    return missing === 1 ? 'Translate the last sentence' : `Translate ${String(missing)} sentences`;
  });

  /** Sentences with no clip under the current voice, from the stored summary. */
  protected readonly audioMissingCount = computed(() => {
    const summary = this.reading().audioSummary;
    return Math.max(summary.total - summary.completed, 0);
  });

  protected readonly audioLabel = computed(() => {
    const missing = this.audioMissingCount();
    return missing === 1
      ? 'Prepare audio for the last sentence'
      : `Prepare audio for ${String(missing)} sentences`;
  });

  /** Chosen entries close the menu; dismissal without choosing is the platform's. */
  protected choose(action: { emit: () => void }): void {
    this.panel().nativeElement.hidePopover();
    action.emit();
  }
}
