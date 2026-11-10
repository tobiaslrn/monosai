import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SetupProgressStore } from '../../application/generation/setup-progress.store';
import { HelpIntroService } from '../../core/layout/help-intro.service';
import { navigationOriginState } from '../../core/routing/navigation-history.service';
import { formatCountOf } from '../../domain/shared/locale';
import { GENERATION_SNAPSHOT_MINIMUM } from '../../domain/vocabulary/snapshot';
import { ButtonDirective } from '../../shared-ui/button/button';
import {
  ChecklistComponent,
  ChecklistStepComponent,
  type ChecklistStepState,
} from '../../shared-ui/checklist/checklist.component';
import { IconComponent } from '../../shared-ui/icon/icon.component';

/**
 * The Library before there is anything on it: the way from an empty shelf to a
 * first story, as numbered steps.
 *
 * This is the screen a stranger lands on at the public address. The hero above
 * says what Monosai is for; this card says what to do, in order, and which of
 * it is done — read from the same checks that block Generate, so the two never
 * disagree. Writing waits on the first two steps and says so as its state.
 * Pasting Japanese needs no setup at all, so it is offered beside the steps,
 * quieter, rather than as one of them. The guide and the one promise that
 * matters to a stranger — nothing leaves this device — are the card's foot.
 *
 * It ends the moment the library has a story, or once a story could be written:
 * from then on the shelf's own Create button is the way in.
 */
@Component({
  selector: 'mn-library-first-steps',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonDirective, ChecklistComponent, ChecklistStepComponent, IconComponent, RouterLink],
  template: `
    <mn-checklist heading="Get started" data-testid="first-steps">
      <mn-checklist-step
        [number]="1"
        heading="Add your words"
        action="Add words"
        link="/reading-level"
        fragment="words"
        testId="first-step-words"
        [navigationState]="libraryOriginState"
        [state]="wordsState()"
      >
        {{ wordsDetail() }}
      </mn-checklist-step>
      <mn-checklist-step
        [number]="2"
        heading="Connect OpenRouter and choose a model"
        action="Open Settings"
        link="/settings"
        testId="first-step-model"
        [navigationState]="libraryOriginState"
        [state]="modelState()"
      >
        {{ modelDetail() }}
      </mn-checklist-step>
      <mn-checklist-step
        [number]="3"
        heading="Write your first story"
        testId="first-step-story"
        state="waiting"
      >
        {{ storyDetail() }}
      </mn-checklist-step>

      <a
        mn-checklist-aside
        mnButton="ghost"
        [edge]="'start'"
        routerLink="/add"
        [state]="libraryOriginState"
        data-testid="first-step-paste"
      >
        <mn-icon name="add" [size]="18" />
        <span>Or paste Japanese text — no setup needed</span>
      </a>

      <a
        mn-checklist-foot
        mnButton="ghost"
        [edge]="'start'"
        routerLink="/help"
        [state]="libraryOriginState"
        (click)="intro?.finish('dismiss')"
        >Read the guide</a
      >
      <span mn-checklist-foot>Everything stays on this device.</span>
    </mn-checklist>
  `,
})
export class LibraryFirstStepsComponent {
  private readonly setup = inject(SetupProgressStore);
  /** Reading the guide from here counts as having been offered it. */
  protected readonly intro = inject(HelpIntroService, { optional: true });
  protected readonly libraryOriginState = navigationOriginState('/library');

  private readonly wordsDone = computed(() => this.setup.words().satisfied);
  private readonly modelDone = computed(() => this.setup.textModelCheck().satisfied);

  /** The first step not yet done is the one to do now. */
  protected readonly wordsState = computed<ChecklistStepState>(() =>
    this.wordsDone() ? 'done' : 'next',
  );
  protected readonly modelState = computed<ChecklistStepState>(() => {
    if (this.modelDone()) {
      return 'done';
    }
    return this.wordsDone() ? 'next' : 'todo';
  });

  protected readonly wordsDetail = computed(() => {
    // Starting from nothing, the step says where words come from and how many
    // a story needs; otherwise it says where the learner's words stand.
    return this.setup.startingFromNothing()
      ? `From Anki, an Anki package, or a pasted list — at least ${formatCountOf(
          GENERATION_SNAPSHOT_MINIMUM,
          'word',
        )}.`
      : this.setup.words().detail;
  });

  protected readonly modelDetail = computed(() => {
    const check = this.setup.textModelCheck();
    return check.satisfied ? 'Ready to write.' : check.detail;
  });

  /** What writing still waits for, said as its state rather than as advice. */
  protected readonly storyDetail = computed(() => {
    const missing = [
      ...(this.wordsDone() ? [] : ['your words']),
      ...(this.modelDone() ? [] : ['a model']),
    ];
    return missing.length === 0 ? 'Ready.' : `Waiting for ${missing.join(' and ')}.`;
  });
}
