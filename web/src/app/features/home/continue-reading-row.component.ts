import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { navigationOriginState } from '../../core/routing/navigation-history.service';
import type { Reading } from '../../domain/reading/reading';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import type { IconName } from '../../shared-ui/icon/icon-set';
import { ListRowComponent } from '../../shared-ui/list-row/list-row.component';

/** Where the learner stands in a story, in paragraphs. */
export interface ReadingPosition {
  readonly paragraph: number;
  readonly of: number;
}

/** One row back into a story: its title, how far in the learner is, and a way on. */
@Component({
  selector: 'mn-continue-reading-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, ListRowComponent],
  template: `
    <mn-list-row
      [routerLink]="['/reader', reading().id]"
      [state]="homeOriginState"
      testId="continue-reading"
    >
      <span mn-list-row-leading class="mn-icon-badge" aria-hidden="true">
        <mn-icon [name]="originIcon()" [size]="18" />
      </span>
      <span mn-list-row-title lang="ja">{{ reading().title }}</span>
      <span mn-list-row-meta>
        <span>Paragraph {{ position().paragraph }} of {{ position().of }}</span>
        <span class="progress" aria-hidden="true">
          <span class="progress-fill" [style.width.%]="percent()"></span>
        </span>
      </span>
      <span mn-list-row-trailing aria-hidden="true">
        <mn-icon name="chevron-right" [size]="20" />
      </span>
    </mn-list-row>
  `,
  styles: `
    /*
     * The bar is a picture of the line above it, drawn in quiet ink: it is not
     * a control, so it does not take the action colour.
     */
    .progress {
      flex-basis: 100%;
      height: 0.25rem;
      overflow: hidden;
      border-radius: var(--radius-pill);
      background: var(--surface-sunken);
    }

    .progress-fill {
      display: block;
      height: 100%;
      background: var(--border-strong);
    }
  `,
})
export class ContinueReadingRowComponent {
  readonly reading = input.required<Reading>();
  readonly position = input.required<ReadingPosition>();

  protected readonly homeOriginState = navigationOriginState('/home');

  protected readonly originIcon = computed<IconName>(() =>
    this.reading().kind === 'generated' ? 'generate' : 'file',
  );

  protected readonly percent = computed(() => {
    const { paragraph, of } = this.position();
    return of > 0 ? Math.min(100, (paragraph / of) * 100) : 0;
  });
}
