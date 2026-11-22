import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonDirective } from '../../../shared-ui/button/button';
import { EmptyStateComponent } from '../../../shared-ui/empty-state/empty-state.component';
import { ErrorScreenComponent } from '../../../shared-ui/error-screen/error-screen.component';
import { ClusterComponent, PageComponent } from '../../../shared-ui/layout/layout';
import { NotFoundPanelComponent } from '../../../shared-ui/not-found/not-found-panel.component';
import { OutcomeComponent } from '../../../shared-ui/outcome/outcome.component';
import { PageHeaderComponent } from '../../../shared-ui/page-header/page-header.component';
import { TextEndComponent } from '../../../shared-ui/text-end/text-end.component';
import { WorkingComponent } from '../../../shared-ui/working/working.component';

/** The states that take a whole page: empty, failed, gone, running, done, and a text's end. */
@Component({
  selector: 'mn-gallery-states',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonDirective,
    ClusterComponent,
    EmptyStateComponent,
    ErrorScreenComponent,
    NotFoundPanelComponent,
    OutcomeComponent,
    PageComponent,
    PageHeaderComponent,
    RouterLink,
    TextEndComponent,
    WorkingComponent,
  ],
  template: `
    <mn-page>
      <mn-page-header heading="Whole-page states" backTo="/gallery" backLabel="Back to gallery" />

      <mn-empty-state heading="No stories yet" description="Write one from your words.">
        <ng-container data-actions>
          <a mnButton="primary" routerLink="/gallery">Write a story</a>
          <a mnButton routerLink="/gallery">Paste text</a>
        </ng-container>
      </mn-empty-state>

      <mn-empty-state heading="No matching words" icon="search">
        <ng-container data-actions>
          <button mnButton type="button">Reset</button>
        </ng-container>
      </mn-empty-state>

      <mn-error-screen
        heading="Your library could not be loaded"
        description="It could not be read from this device."
        dataStatus="Your saved stories have not been changed."
      >
        <ng-container data-actions>
          <button mnButton="primary" type="button">Try again</button>
        </ng-container>
      </mn-error-screen>

      <mn-not-found-panel
        heading="This story is no longer here"
        [explanation]="['It may have been deleted.', 'Nothing else in your library was affected.']"
        primaryLink="/gallery"
        secondaryLink="/gallery"
        secondaryLabel="Write a story"
      />

      <mn-outcome variant="progress" label="Writing your story">
        <mn-working heading="Writing your story" detail="Step 2 of 4 · the plot" />
        <button mn-outcome-action mnButton="ghost" type="button">Stop</button>
      </mn-outcome>

      <mn-outcome mark="success" eyebrow="Saved to your library" heading="A walk in the park">
        <p>Preparing audio</p>
        <a mn-outcome-action mnButton="primary" routerLink="/gallery">Open story</a>
        <a mn-outcome-action mnButton routerLink="/gallery">Write another</a>
      </mn-outcome>

      <mn-outcome heading="The story could not be written">
        <p>The model stopped before the end. Nothing was saved.</p>
        <button mn-outcome-action mnButton="primary" type="button">Try again</button>
      </mn-outcome>

      <mn-text-end heading="The end">
        <mn-cluster fill="split">
          <a mnButton="primary" routerLink="/gallery">Next story</a>
          <a mnButton routerLink="/gallery">Library</a>
        </mn-cluster>
      </mn-text-end>
    </mn-page>
  `,
})
export class GalleryStatesComponent {}
