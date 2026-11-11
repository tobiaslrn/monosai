import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { CLOCK } from '../../application/shared/repository-tokens';
import { navigationOriginState } from '../../core/routing/navigation-history.service';
import type { Reading, StoryForm } from '../../domain/reading/reading';
import { formatCountOf, formatRelativeDay } from '../../domain/shared/locale';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import type { IconName } from '../../shared-ui/icon/icon-set';
import { ListRowComponent } from '../../shared-ui/list-row/list-row.component';
import { ButtonDirective } from '../../shared-ui/button/button';
import { ClusterComponent } from '../../shared-ui/layout/layout';
import {
  MenuComponent,
  MenuItemDirective,
  MenuTriggerDirective,
} from '../../shared-ui/menu/menu.component';

/** What a story's length is called, in the words the generate form uses. */
const FORM_LABELS: Readonly<Record<StoryForm, string>> = {
  micro: 'Micro',
  short: 'Short',
  medium: 'Medium',
  long: 'Long',
};

/** A compact home row: title, opening line, character count, opened status, and actions. */
@Component({
  selector: 'mn-reading-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonDirective,
    ClusterComponent,
    IconComponent,
    ListRowComponent,
    MenuComponent,
    MenuItemDirective,
    MenuTriggerDirective,
  ],
  template: `
    <mn-list-row
      [routerLink]="['/reader', reading().id]"
      [state]="libraryOriginState"
      [testId]="'reading-row'"
    >
      <span mn-list-row-leading class="mn-icon-badge" aria-hidden="true">
        <mn-icon [name]="originIcon()" />
      </span>
      <span mn-list-row-title lang="ja">{{ reading().title }}</span>
      <!--
        The opening of the text, so a row says what is in it. The title above
        and the line below stay short; this is the one line that is Japanese.
      -->
      @if (reading().excerpt !== '') {
        <span mn-list-row-excerpt lang="ja">{{ reading().excerpt }}</span>
      }
      <!--
        One visible line: size, and a story's length. The origin is the leading
        icon and opened-or-not is the status pill, so both are said here only
        to assistive technology, together with when it was last read.
      -->
      <span mn-list-row-meta>
        <span>{{ characterLabel() }}</span>
        @if (shapeLabel(); as shape) {
          <span>{{ shape }}</span>
        }
        @if (hasAudio()) {
          <mn-cluster [gap]="1" title="Audio">
            <mn-icon name="audio" [size]="16" />
            <span class="mn-visually-hidden">Audio</span>
          </mn-cluster>
        }
        <span class="mn-visually-hidden">{{ originLabel() }}, {{ lastReadLabel() }}</span>
      </span>
      <!-- Only what is still new is marked; a pill on every opened row was noise. -->
      @if (reading().lastOpenedAt === null) {
        <span mn-list-row-trailing>
          <span class="mn-status-pill">Unread</span>
        </span>
      }
      <span mn-list-row-menu>
        <button
          mnButton="icon"
          type="button"
          aria-haspopup="menu"
          [mnMenuTrigger]="actions"
          [attr.aria-label]="'Actions for ' + reading().title"
          [attr.title]="'Actions for ' + reading().title"
        >
          <mn-icon name="overflow" />
        </button>
        <mn-menu
          #actions="mnMenu"
          [menu]="true"
          [attr.aria-label]="'Actions for ' + reading().title"
        >
          <button mnMenuItem type="button" (click)="requestRename()">
            <mn-icon name="rename" />
            <span>Rename</span>
          </button>
          <hr class="mn-dropdown__separator" />
          <button mnMenuItem="danger" type="button" (click)="requestDelete()">
            <mn-icon name="delete" />
            <span>Delete</span>
          </button>
        </mn-menu>
      </span>
    </mn-list-row>
  `,
})
export class ReadingCardComponent {
  protected readonly libraryOriginState = navigationOriginState('/library');
  private readonly clock = inject(CLOCK);
  readonly reading = input.required<Reading>();
  readonly deleteRequested = output<Reading>();
  readonly renameRequested = output<Reading>();

  private readonly actions = viewChild.required<MenuComponent>('actions');

  protected readonly characterLabel = computed(() =>
    formatCountOf(this.reading().characterCount, 'character'),
  );

  protected readonly originIcon = computed<IconName>(() =>
    this.reading().kind === 'generated' ? 'generate' : 'file',
  );

  protected readonly originLabel = computed(() =>
    this.reading().kind === 'generated' ? 'Generated' : 'Imported',
  );

  /**
   * How long a generated story is, said the way the screen that made it says
   * it. An import has no such length, and how it came in is the leading icon.
   */
  protected readonly shapeLabel = computed(() => {
    const reading = this.reading();
    return reading.kind === 'generated' ? FORM_LABELS[reading.form] : null;
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

  protected requestRename(): void {
    this.hideMenu();
    this.renameRequested.emit(this.reading());
  }

  protected requestDelete(): void {
    this.hideMenu();
    this.deleteRequested.emit(this.reading());
  }

  private hideMenu(): void {
    this.actions().hide();
  }
}
