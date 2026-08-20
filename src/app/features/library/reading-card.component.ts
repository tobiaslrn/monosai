import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Reading } from '../../domain/reading/reading';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { completionLabel, grammarLabel } from './reading-summary-labels';

/**
 * One library card.
 *
 * Everything shown comes from the denormalized `readings` row, so rendering a
 * page of cards never loads sentences, token analyses, or audio blobs.
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

      <p class="meta">
        <span class="badge" [class.is-generated]="reading().kind === 'generated'">{{
          reading().kind === 'generated' ? 'Generated' : 'Imported'
        }}</span>
        <span>{{ createdLabel() }}</span>
      </p>

      <ul class="status">
        <li>{{ reading().sentenceCount.toLocaleString('en') }} sentences</li>
        <li>{{ translationLabel() }}</li>
        <li>{{ grammarLine() }}</li>
        <li>{{ audioLabel() }}</li>
      </ul>

      @if (reading().lastOpenedAt !== null) {
        <p class="opened">Last opened {{ openedLabel() }}</p>
      }
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
      flex-wrap: wrap;
      gap: var(--space-2);
      align-items: center;
      margin: 0;
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .badge {
      padding: 2px var(--space-2);
      border-radius: var(--radius-pill);
      background: var(--action-primary-soft);
      color: var(--text-primary);
    }

    .badge.is-generated {
      background: var(--accent-secondary-soft);
    }

    .status {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-3);
      margin: 0;
      padding: 0;
      color: var(--text-secondary);
      font-size: var(--text-sm);
      list-style: none;
    }

    .opened {
      margin: 0;
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }
  `,
})
export class ReadingCardComponent {
  readonly reading = input.required<Reading>();
  readonly deleteRequested = output<Reading>();

  private readonly menuOpenSignal = signal(false);
  protected readonly menuOpen = this.menuOpenSignal.asReadonly();

  protected readonly createdLabel = computed(() =>
    new Date(this.reading().createdAt).toLocaleString(),
  );

  protected readonly openedLabel = computed(() => {
    const openedAt = this.reading().lastOpenedAt;
    return openedAt === null ? '' : new Date(openedAt).toLocaleDateString();
  });

  protected readonly translationLabel = computed(() =>
    completionLabel('Translations', this.reading().translationSummary),
  );

  protected readonly grammarLine = computed(() => grammarLabel(this.reading().grammarSummary));

  protected readonly audioLabel = computed(() =>
    completionLabel('Audio', this.reading().audioSummary),
  );

  protected toggleMenu(): void {
    this.menuOpenSignal.update((open) => !open);
  }

  protected requestDelete(): void {
    this.menuOpenSignal.set(false);
    this.deleteRequested.emit(this.reading());
  }
}
