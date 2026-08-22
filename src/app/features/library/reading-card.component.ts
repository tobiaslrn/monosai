import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Reading } from '../../domain/reading/reading';
import { IconComponent } from '../../shared-ui/icon/icon.component';

/** One compact library row, with only the metadata useful before opening it. */
@Component({
  selector: 'mn-reading-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent],
  template: `
    <article class="reading-row">
      <div class="head">
        <div class="copy">
          <h3>
            <a [routerLink]="['/reader', reading().id]">{{ reading().title }}</a>
          </h3>
          <p class="meta">
            <span>{{ characterLabel() }}</span>
            @if (hasAudio()) {
              <span class="separator" aria-hidden="true">·</span>
              <span class="audio-available">
                <mn-icon name="audio" [size]="16" />
                <span>Audio available</span>
              </span>
            }
          </p>
        </div>
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
    </article>
  `,
  styles: `
    .reading-row {
      position: relative;
      min-height: 76px;
      padding: var(--space-3) var(--space-1) var(--space-3) var(--space-3);
      border-bottom: 1px solid var(--border-subtle);
      transition: background-color var(--motion-fast) ease-out;
    }

    .reading-row:hover {
      background: var(--surface-sunken);
    }

    .head {
      display: flex;
      gap: var(--space-3);
      align-items: center;
      justify-content: space-between;
    }

    .copy {
      min-width: 0;
    }

    h3 {
      margin: 0;
      font-family: var(--font-japanese);
      font-size: 20px;
      line-height: 1.35;
    }

    h3 a {
      color: var(--text-primary);
      text-decoration: none;
    }

    h3 a::after {
      position: absolute;
      inset: 0;
      content: '';
    }

    .reading-row:has(h3 a:focus-visible) {
      outline: 3px solid var(--focus-ring);
      outline-offset: 2px;
    }

    .menu-anchor {
      position: relative;
      z-index: 1;
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
      gap: var(--space-1);
      align-items: center;
      margin: var(--space-1) 0 0;
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .audio-available {
      display: inline-flex;
      gap: var(--space-1);
      align-items: center;
    }
  `,
})
export class ReadingCardComponent {
  readonly reading = input.required<Reading>();
  readonly deleteRequested = output<Reading>();

  private readonly menuOpenSignal = signal(false);
  protected readonly menuOpen = this.menuOpenSignal.asReadonly();

  protected readonly characterLabel = computed(() => {
    const count = this.reading().characterCount;
    return count === 1 ? '1 character' : `${String(count)} characters`;
  });
  protected readonly hasAudio = computed(() => this.reading().audioSummary.completed > 0);

  protected toggleMenu(): void {
    this.menuOpenSignal.update((open) => !open);
  }

  protected requestDelete(): void {
    this.menuOpenSignal.set(false);
    this.deleteRequested.emit(this.reading());
  }
}
