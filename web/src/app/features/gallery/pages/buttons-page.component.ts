import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ActionBarComponent } from '../../../shared-ui/action-bar/action-bar.component';
import { ButtonDirective } from '../../../shared-ui/button/button';
import { CardComponent } from '../../../shared-ui/card/card.component';
import { ChipGroupComponent } from '../../../shared-ui/chip-group/chip-group.component';
import { IconComponent } from '../../../shared-ui/icon/icon.component';
import {
  ClusterComponent,
  PageComponent,
  SplitComponent,
  StackComponent,
} from '../../../shared-ui/layout/layout';
import { PageHeaderComponent } from '../../../shared-ui/page-header/page-header.component';
import { SectionComponent } from '../../../shared-ui/section/section.component';

/** Every button emphasis and state, the chips, and the rows they sit in. */
@Component({
  selector: 'mn-gallery-buttons',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ActionBarComponent,
    ButtonDirective,
    CardComponent,
    ChipGroupComponent,
    ClusterComponent,
    IconComponent,
    PageComponent,
    PageHeaderComponent,
    RouterLink,
    SectionComponent,
    SplitComponent,
    StackComponent,
  ],
  template: `
    <mn-page>
      <mn-page-header heading="Buttons" backTo="/gallery" backLabel="Back to gallery">
        <button mnButton="icon" type="button" aria-label="Help" title="Help">
          <mn-icon name="help" />
        </button>
      </mn-page-header>

      <mn-section heading="Emphases">
        <mn-cluster>
          <button mnButton="primary" type="button">Save</button>
          <button mnButton type="button">Preview</button>
          <button mnButton="ghost" type="button">Reset</button>
          <button mnButton="ghost" tone="danger" type="button">Delete story</button>
          <button mnButton="danger" type="button">Delete</button>
        </mn-cluster>
        <mn-cluster>
          <a mnButton="primary" routerLink="/gallery">Open story</a>
          <a mnButton routerLink="/gallery">Open Help</a>
          <a mnButton="ghost" routerLink="/gallery">Not now</a>
        </mn-cluster>
      </mn-section>

      <mn-section heading="With icons">
        <mn-cluster>
          <button mnButton="primary" type="button"><mn-icon name="add" />Add story</button>
          <button mnButton type="button"><mn-icon name="sync" />Refresh</button>
          <button mnButton="icon" type="button" aria-label="More" title="More">
            <mn-icon name="overflow" />
          </button>
          <button mnButton="icon-primary" type="button" aria-label="Play" title="Play">
            <mn-icon name="play" />
          </button>
        </mn-cluster>
      </mn-section>

      <mn-section heading="States">
        <mn-cluster>
          <button mnButton="primary" type="button" [disabled]="true">Save</button>
          <button mnButton type="button" [disabled]="true">Preview</button>
          <button mnButton="primary" type="button" aria-busy="true">
            <mn-icon name="sync" />Refreshing
          </button>
          <button mnButton type="button" aria-busy="true"><mn-icon name="retry" />Retrying</button>
        </mn-cluster>
      </mn-section>

      <mn-section heading="Chips">
        <mn-chip-group label="Genre">
          @for (genre of genres; track genre) {
            <button
              mnButton
              type="button"
              [attr.aria-pressed]="chosen() === genre"
              (click)="chosen.set(genre)"
            >
              {{ genre }}
            </button>
          }
        </mn-chip-group>
      </mn-section>

      <mn-section heading="Rows of buttons">
        <mn-stack>
          <mn-cluster fill="narrow" role="group" aria-label="Filter stories">
            <button mnButton type="button" aria-pressed="true">All</button>
            <button mnButton type="button" aria-pressed="false">Unread</button>
            <button mnButton type="button" aria-pressed="false">Finished</button>
          </mn-cluster>
          <mn-cluster fill="split">
            <button mnButton="primary" type="button">Next story</button>
            <button mnButton type="button">Library</button>
          </mn-cluster>
          <mn-cluster justify="end">
            <button mnButton="ghost" type="button">Cancel</button>
            <button mnButton="primary" type="button">Save</button>
          </mn-cluster>
          <mn-split>
            <span>Words from Anki</span>
            <button mn-split-end mnButton type="button">Connect</button>
          </mn-split>
          <mn-cluster>
            <button mnButton="ghost" edge="start" type="button">Show more</button>
          </mn-cluster>
        </mn-stack>
      </mn-section>

      <mn-card heading="Action bar">
        <mn-action-bar>
          <button mnButton="primary" type="button">Write story</button>
        </mn-action-bar>
      </mn-card>
    </mn-page>
  `,
})
export class GalleryButtonsComponent {
  protected readonly genres = ['Mystery', 'Everyday life', 'Travel', 'Science fiction'];
  protected readonly chosen = signal('Everyday life');
}
