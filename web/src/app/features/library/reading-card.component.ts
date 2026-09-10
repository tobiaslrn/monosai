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
import { CLOCK } from '../../application/shared/repository-tokens';
import { navigationOriginState } from '../../core/routing/navigation-history.service';
import type { ImportSource, Reading, StoryForm } from '../../domain/reading/reading';
import { formatCountOf, formatRelativeDay } from '../../domain/shared/locale';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import type { IconName } from '../../shared-ui/icon/icon-set';
import { ListRowComponent } from '../../shared-ui/list-row/list-row.component';

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
  imports: [IconComponent, ListRowComponent],
  host: {
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
    '(document:keydown.escape)': 'closeMenuOnEscape($event)',
  },
  template: `
    <mn-list-row
      [routerLink]="['/reader', reading().id]"
      [state]="libraryOriginState"
      [testId]="'reading-row'"
    >
      <span mn-list-row-leading class="mn-icon-badge" aria-hidden="true">
        <mn-icon [name]="originIcon()" [size]="20" />
      </span>
      <span mn-list-row-title lang="ja">{{ reading().title }}</span>
      <span mn-list-row-meta>
        <span>{{ characterLabel() }}</span>
        <span class="separator" aria-hidden="true">·</span>
        <span>{{ originLabel() }}</span>
        <span class="separator" aria-hidden="true">·</span>
        <span>{{ shapeLabel() }}</span>
        <span class="separator" aria-hidden="true">·</span>
        <span>{{ lastReadLabel() }}</span>
        @if (hasAudio()) {
          <span class="separator" aria-hidden="true">·</span>
          <span class="audio-available">
            <mn-icon name="audio" [size]="16" />
            <span>Audio</span>
          </span>
        }
      </span>
      <span mn-list-row-trailing>
        <span
          class="mn-status-pill"
          [class.mn-status-pill--accent]="reading().lastOpenedAt === null"
        >
          {{ reading().lastOpenedAt === null ? 'Unread' : 'Read' }}
        </span>
      </span>
      <span mn-list-row-menu>
        <span class="menu-anchor">
          <button
            #toggle
            type="button"
            class="mn-icon-button"
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
        </span>
      </span>
    </mn-list-row>
  `,
  styles: `
    .menu-anchor {
      position: relative;
      z-index: 1;
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

    .audio-available {
      display: inline-flex;
      gap: var(--space-1);
      align-items: center;
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

  protected readonly originIcon = computed<IconName>(() =>
    this.reading().kind === 'generated' ? 'generate' : 'file',
  );

  protected readonly originLabel = computed(() =>
    this.reading().kind === 'generated' ? 'Generated' : 'Imported',
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
