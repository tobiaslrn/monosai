import type { ElementRef } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CLOCK } from '../../application/shared/repository-tokens';
import { navigationOriginState } from '../../core/routing/navigation-history.service';
import type { ImportSource, Reading, StoryForm } from '../../domain/reading/reading';
import { formatCountOf, formatRelativeDay } from '../../domain/shared/locale';
import { IconComponent } from '../../shared-ui/icon/icon.component';

/** What a story's length is called, in the words the generate form uses. */
const FORM_LABELS: Readonly<Record<StoryForm, string>> = {
  micro: 'Micro',
  short: 'Short',
  medium: 'Medium',
  long: 'Long',
};

/** Where an imported reading came from. */
const IMPORT_LABELS: Readonly<Record<ImportSource, string>> = {
  paste: 'Pasted',
  'text-file': 'Text file',
};

/** A compact home row: title, character count, opened status, and actions. */
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
        <span class="story-mark" aria-hidden="true"></span>
        <div class="copy">
          <div class="title-row">
            <h3>
              <a lang="ja" [routerLink]="['/reader', reading().id]" [state]="libraryOriginState">
                {{ reading().title }}
              </a>
            </h3>
            <p class="meta mn-visually-hidden">
              <span class="shape-label">{{ shapeLabel() }}</span>
              <span class="separator" aria-hidden="true">·</span>
              <span>{{ lastReadLabel() }}</span>
              @if (hasAudio()) {
                <span class="separator" aria-hidden="true">·</span>
                <span class="audio-available">
                  <mn-icon name="audio" [size]="16" />
                  <span>Audio</span>
                </span>
              }
            </p>
          </div>
          <p class="summary">{{ characterLabel() }}</p>
        </div>
        <span class="status" [class.is-unread]="reading().lastOpenedAt === null">
          {{ reading().lastOpenedAt === null ? 'Unread' : 'Read' }}
        </span>
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
            [attr.aria-label]="'Actions for ' + reading().title"
            (toggle)="onMenuToggle($event)"
          >
            <button type="button" role="menuitem" (click)="requestRename()">
              <mn-icon name="rename" [size]="18" />
              <span>Rename</span>
            </button>
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
    @use '../../../styles/breakpoints' as breakpoints;

    .reading-row {
      position: relative;
      min-height: 3.75rem;
      padding: var(--space-1) 0 var(--space-1) var(--space-3);
      border: 1px solid color-mix(in srgb, var(--border-subtle) 35%, transparent);
      border-radius: var(--radius-card);
      background: var(--surface-raised);
      transition: background-color var(--motion-fast) ease-out;
    }

    .reading-row:hover {
      background: var(--surface-sunken);
    }

    .head {
      display: flex;
      gap: var(--space-2);
      align-items: center;
      justify-content: space-between;
    }

    .story-mark {
      flex: 0 0 auto;
      width: 1.5rem;
      height: 1.5rem;
      border-radius: 50%;
      background: var(--action-primary-soft);
    }

    .copy {
      flex: 1;
      min-width: 0;
    }

    /* Detailed provenance remains available to assistive technology. */
    .title-row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1) var(--space-3);
      align-items: baseline;
      justify-content: space-between;
      min-width: 0;
    }

    h3 {
      min-width: 0;
      margin: 0;
      font-family: var(--font-ui);
      font-size: var(--text-sm);
      font-weight: 500;
      line-height: 1.35;
      overflow-wrap: anywhere;
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
      flex: none;
      flex-wrap: wrap;
      gap: var(--space-1);
      align-items: center;
      margin: 0;
      color: var(--text-secondary);
      font-size: 0.75rem;
    }

    .status {
      flex: none;
      padding: var(--space-1) var(--space-2);
      border-radius: var(--radius-pill);
      background: var(--status-success-soft);
      color: var(--status-success);
      font-size: 0.6875rem;
      line-height: 1.2;
    }

    .status.is-unread {
      background: var(--status-warning-soft);
      color: var(--status-warning);
    }

    @media (max-width: breakpoints.$narrow-max) {
      .reading-row {
        min-height: 3.75rem;
      }

      .head {
        min-height: var(--touch-target);
      }

      .title-row {
        display: block;
      }

      h3 {
        font-size: var(--text-sm);
        line-height: 1.3;
      }
    }

    /* Keep the character count quiet beneath the title. */
    .summary {
      display: -webkit-box;
      margin: 0;
      overflow: hidden;
      color: var(--text-secondary);
      font-size: 0.75rem;
      line-height: 1.3;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 1;
    }

    .audio-available {
      display: inline-flex;
      gap: var(--space-1);
      align-items: center;
    }

    @media (max-width: breakpoints.$narrow-max) {
      .summary {
        margin-top: 0;
        -webkit-line-clamp: 1;
      }
    }
  `,
})
export class ReadingCardComponent {
  protected readonly libraryOriginState = navigationOriginState('/library');
  private readonly clock = inject(CLOCK);
  readonly reading = input.required<Reading>();
  readonly deleteRequested = output<Reading>();
  readonly renameRequested = output<Reading>();

  private readonly menuOpenSignal = signal(false);
  protected readonly menuOpen = this.menuOpenSignal.asReadonly();
  private readonly menu = viewChild.required<ElementRef<HTMLElement>>('menu');
  private readonly toggleButton = viewChild.required<ElementRef<HTMLButtonElement>>('toggle');

  protected readonly menuId = computed(() => `mn-reading-actions-${this.reading().id}`);
  protected readonly anchorName = computed(() => `--mn-reading-actions-${this.reading().id}`);

  protected readonly characterLabel = computed(() =>
    formatCountOf(this.reading().characterCount, 'character'),
  );

  /** How long the reading is, said the way the screen that made it says it. */
  protected readonly shapeLabel = computed(() => {
    const reading = this.reading();
    return reading.kind === 'generated'
      ? FORM_LABELS[reading.form]
      : IMPORT_LABELS[reading.importSource];
  });

  /**
   * When the reading was last opened.
   *
   * A reading nobody has opened says so rather than falling back to when it was
   * added: the two are different facts, and only one of them is about reading.
   */
  protected readonly lastReadLabel = computed(() => {
    const openedAt = this.reading().lastOpenedAt;
    return openedAt === null ? 'unread' : `read ${formatRelativeDay(openedAt, this.clock.now())}`;
  });

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

  protected requestRename(): void {
    this.hideMenu();
    this.renameRequested.emit(this.reading());
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
