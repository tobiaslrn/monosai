import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatCount } from '../../../domain/shared/locale';
import { ButtonDirective } from '../../../shared-ui/button/button';
import { CardComponent } from '../../../shared-ui/card/card.component';
import {
  ChecklistComponent,
  ChecklistStepComponent,
} from '../../../shared-ui/checklist/checklist.component';
import { CountingCountComponent } from '../../../shared-ui/counting-count/counting-count.component';
import { PageComponent } from '../../../shared-ui/layout/layout';
import { PageHeaderComponent } from '../../../shared-ui/page-header/page-header.component';
import { PreparationTargetsComponent } from '../../../shared-ui/preparation-targets/preparation-targets.component';
import { SectionComponent } from '../../../shared-ui/section/section.component';
import { StepperComponent, type StepperStep } from '../../../shared-ui/stepper/stepper.component';
import { WizardStepComponent } from '../../../shared-ui/wizard-steps/wizard-step.component';
import { WizardStepsComponent } from '../../../shared-ui/wizard-steps/wizard-steps.component';

/** Where a learner or a long task stands: first steps, a stepper, a form in steps. */
@Component({
  selector: 'mn-gallery-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonDirective,
    CardComponent,
    ChecklistComponent,
    ChecklistStepComponent,
    CountingCountComponent,
    PageComponent,
    PageHeaderComponent,
    PreparationTargetsComponent,
    RouterLink,
    SectionComponent,
    StepperComponent,
    WizardStepComponent,
    WizardStepsComponent,
  ],
  template: `
    <mn-page>
      <mn-page-header heading="Steps and progress" backTo="/gallery" backLabel="Back to gallery" />

      <mn-checklist heading="Get started">
        <mn-checklist-step [number]="1" heading="Add your words" state="done" link="/gallery">
          120 words
        </mn-checklist-step>
        <mn-checklist-step [number]="2" heading="Connect a model" state="next" link="/gallery">
          Add an OpenRouter key
        </mn-checklist-step>
        <mn-checklist-step [number]="3" heading="Choose a voice" state="todo" link="/gallery">
          Optional
        </mn-checklist-step>
        <mn-checklist-step [number]="4" heading="Write a story" state="waiting">
          After steps 1 and 2
        </mn-checklist-step>
        <a mn-checklist-aside mnButton="ghost" routerLink="/gallery">Or paste text</a>
      </mn-checklist>

      <mn-section heading="Stepper">
        <mn-stepper label="Generation progress" [steps]="stepper" />
      </mn-section>

      <mn-section heading="Stepper with a failure">
        <mn-stepper label="Preparation progress" [steps]="failedStepper" />
      </mn-section>

      <mn-wizard-steps
        label="Steps"
        [steps]="['Words', 'Direction', 'Plot', 'Write']"
        [current]="2"
      />
      <mn-wizard-step [step]="2">
        <mn-card heading="Direction">
          <p>Choose a setting and a mood for the story.</p>
        </mn-card>
      </mn-wizard-step>

      <mn-preparation-targets [targets]="['english', 'grammar']" audioReadiness="ready" />
      <mn-preparation-targets
        legend="Prepare new stories"
        [targets]="['english']"
        audioReadiness="no-credential"
      />

      <mn-card heading="Counting count">
        <p>You know <mn-counting-count [count]="515" [format]="formatCount" /> words.</p>
      </mn-card>
    </mn-page>
  `,
})
export class GalleryProgressComponent {
  protected readonly stepper: readonly StepperStep[] = [
    { key: 'words', label: 'Words', status: 'complete', detail: '120 words' },
    { key: 'plot', label: 'Plot', status: 'complete' },
    { key: 'story', label: 'Story', status: 'active' },
    { key: 'translation', label: 'Translation', status: 'pending' },
    { key: 'audio', label: 'Audio', status: 'skipped' },
  ];
  protected readonly failedStepper: readonly StepperStep[] = [
    { key: 'translation', label: 'Translation', status: 'complete' },
    { key: 'grammar', label: 'Grammar notes', status: 'retrying', detail: 'attempt 2' },
    { key: 'audio', label: 'Audio', status: 'failed' },
  ];
  protected readonly formatCount = formatCount;
}
