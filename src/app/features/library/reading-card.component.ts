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
import { RouterLink } from '@angular/router';
import { navigationOriginState } from '../../core/routing/navigation-history.service';
import type { Reading } from '../../domain/reading/reading';
import { formatCountOf, formatDateTime } from '../../domain/shared/locale';
import { IconComponent } from '../../shared-ui/icon/icon.component';

/** One compact library row, with only the metadata useful before opening it. */
@Component({
  selector: 'mn-reading-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent],
  host: {
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
    '(document:keydown.escape)': 'closeMenuOnEscape($event)',
  },
  template: `
    <article class="reading-row">
      <div class="head">
        <div class="copy">
          <h3>
            <a [routerLink]="['/reader', reading().id]" [state]="libraryOriginState">
              {{ reading().title }}
            </a>
          </h3>
          <p class="meta">
            <span>{{ characterLabel() }}</span>
            <span class="separator" aria-hidden="true">·</span>
            <span>{{ createdLabel() }}</span>
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
            #toggle
            type="button"
            class="overflow"
            aria-haspopup="menu"
            [attr.aria-controls]="menuId()"
            [attr.aria-expanded]="menuOpen()"
            [attr.aria-label]="'Actions for ' + reading().title"
            [attr.popovertarget]="menuId()"
            [style.anchor-name]="anchorName()"
          >
            <mn-icon name="overflow" [size]="20" />
          </button>
          <div
            #menu
            class="menu"
            popover
            role="menu"
            [id]="menuId()"
            [style.position-anchor]="anchorName()"
            [attr.aria-label]="reading().title + ' actions'"
            (toggle)="onMenuToggle($event)"
          >
            <button type="button" role="menuitem" class="danger" (click)="requestDelete()">
              <mn-icon name="delete" [size]="18" />
              <span>Delete</span>
            </button>
          </div>
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
      position-area: bottom span-left;
      z-index: 2;
      inset: auto;
      display: flex;
      flex-direction: column;
      min-width: 12rem;
      margin: var(--space-1) 0 0;
      padding: var(--space-1);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-control);
      background: var(--surface-raised);
      box-shadow: var(--shadow-overlay);
    }

    .menu:not(:popover-open) {
      display: none;
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
  protected readonly libraryOriginState = navigationOriginState('/library');
  readonly reading = input.required<Reading>();
  readonly deleteRequested = output<Reading>();

  private readonly menuOpenSignal = signal(false);
  protected readonly menuOpen = this.menuOpenSignal.asReadonly();
  private readonly menu = viewChild.required<ElementRef<HTMLElement>>('menu');
  private readonly toggleButton = viewChild.required<ElementRef<HTMLButtonElement>>('toggle');

  protected readonly menuId = computed(() => `mn-reading-actions-${this.reading().id}`);
  protected readonly anchorName = computed(() => `--mn-reading-actions-${this.reading().id}`);

  protected readonly characterLabel = computed(() =>
    formatCountOf(this.reading().characterCount, 'character'),
  );
  protected readonly createdLabel = computed(() => formatDateTime(this.reading().createdAt));
  protected readonly hasAudio = computed(() => this.reading().audioSummary.completed > 0);

  protected onMenuToggle(event: Event): void {
    this.menuOpenSignal.set((event.currentTarget as HTMLElement).matches(':popover-open'));
  }

  protected closeMenuOnEscape(event: Event): void {
    const menu = this.menu().nativeElement;
    if (!menu.matches(':popover-open')) {
      return;
    }
    event.preventDefault();
    this.hideMenu();
  }

  protected onDocumentPointerDown(event: PointerEvent): void {
    const menu = this.menu().nativeElement;
    if (!menu.matches(':popover-open') || !(event.target instanceof Node)) {
      return;
    }
    if (menu.contains(event.target) || this.toggleButton().nativeElement.contains(event.target)) {
      return;
    }
    this.hideMenu();
  }

  protected requestDelete(): void {
    this.hideMenu();
    this.deleteRequested.emit(this.reading());
  }

  private hideMenu(): void {
    const menu = this.menu().nativeElement;
    if (typeof menu.hidePopover === 'function' && menu.matches(':popover-open')) {
      menu.hidePopover();
    }
  }
}
