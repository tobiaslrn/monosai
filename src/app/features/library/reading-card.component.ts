import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CLOCK } from '../../application/shared/repository-tokens';
import type { Reading } from '../../domain/reading/reading';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { relativeDay } from '../../shared-ui/reading-summary/reading-summary-labels';

/**
 * One library card.
 *
 * It shows the reading rather than a report on it: the title, the opening in
 * Japanese, and one quiet line saying when it arrived. Everything comes from the
 * denormalized `readings` row, so a shelf of cards is still one bounded query.
 *
 * The excerpt is a preview and nothing more — no furigana, no tap targets, no
 * markers. Those belong to the reader, and putting them here would make a card
 * look like something you could read from.
 */
@Component({
  selector: 'mn-reading-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent],
  template: `
    <article class="card">
      <div class="head">
        <h3>
          <a [routerLink]="['/reader', reading().id]">{{ reading().title }}</a>
        </h3>
        <div class="menu-anchor">
          <button
            type="button"
            class="overflow"
            [attr.aria-expanded]="menuOpen()"
            [attr.aria-label]="'Actions for ' + reading().title"
            (click)="toggleMenu()"
          >
            <mn-icon name="overflow" [size]="20" />
          </button>
          @if (menuOpen()) {
            <div class="menu" role="group" [attr.aria-label]="reading().title + ' actions'">
              <button type="button" class="danger" (click)="requestDelete()">
                <mn-icon name="delete" [size]="18" />
                <span>Delete</span>
              </button>
            </div>
          }
        </div>
      </div>

      @if (reading().excerpt) {
        <p class="excerpt" lang="ja" aria-hidden="true">{{ reading().excerpt }}</p>
      }

      <p class="meta">
        <span>{{ addedLabel() }}</span>
        @if (hasAudio()) {
          <mn-icon name="audio" [size]="16" />
          <span class="mn-visually-hidden">Has audio</span>
        }
      </p>
    </article>
  `,
  styles: `
    .card {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      height: 100%;
      padding: var(--space-4);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-card);
      background: var(--surface-panel);
    }

    .head {
      display: flex;
      gap: var(--space-2);
      align-items: flex-start;
      justify-content: space-between;
    }

    h3 {
      margin: 0;
      font-size: var(--text-lg);
    }

    h3 a {
      color: var(--text-primary);
      text-decoration: none;
    }

    h3 a:hover {
      text-decoration: underline;
    }

    /*
     * Clamped rather than truncated at a character count: three lines of the
     * card's own width is what makes a shelf of cards the same height, whatever
     * the glyphs are.
     */
    .excerpt {
      display: -webkit-box;
      flex: 1;
      margin: 0;
      overflow: hidden;
      color: var(--text-secondary);
      font-family: var(--font-japanese);
      line-height: 1.7;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
    }

    .menu-anchor {
      position: relative;
      flex: none;
    }

    .overflow {
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

    .overflow:hover {
      border-color: var(--border-subtle);
    }

    .menu {
      position: absolute;
      z-index: 2;
      inset-inline-end: 0;
      display: flex;
      flex-direction: column;
      min-width: 12rem;
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
      font: inherit;
      text-align: start;
      cursor: pointer;
    }

    .menu .danger {
      color: var(--status-danger);
    }

    .menu button:hover {
      background: var(--surface-sunken);
    }

    .meta {
      display: flex;
      gap: var(--space-2);
      align-items: center;
      margin: 0;
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }
  `,
})
export class ReadingCardComponent {
  readonly reading = input.required<Reading>();
  readonly deleteRequested = output<Reading>();

  private readonly clock = inject(CLOCK);

  private readonly menuOpenSignal = signal(false);
  protected readonly menuOpen = this.menuOpenSignal.asReadonly();

  protected readonly addedLabel = computed(() =>
    relativeDay(this.reading().createdAt, this.clock.now()),
  );

  protected readonly hasAudio = computed(() => this.reading().audioSummary.completed > 0);

  protected toggleMenu(): void {
    this.menuOpenSignal.update((open) => !open);
  }

  protected requestDelete(): void {
    this.menuOpenSignal.set(false);
    this.deleteRequested.emit(this.reading());
  }
}
