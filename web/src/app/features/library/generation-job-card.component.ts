import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { GenerationJob } from '../../application/generation/generation-jobs.store';
import { navigationOriginState } from '../../core/routing/navigation-history.service';
import { ButtonDirective } from '../../shared-ui/button/button';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { ListRowComponent } from '../../shared-ui/list-row/list-row.component';
import { generationWaitCopy } from '../generate/generation-wait.component';

/**
 * One library row for a story that is still being written, or one that stopped
 * without producing anything.
 *
 * It is a reading row: the same anatomy, surface and height, so the shelf is
 * laid out identically before, during, and after a generation and nothing
 * jumps when the story lands. Its status and the stage the run is actually in
 * are its one line, because a bar or a spinner would promise progress the
 * pipeline cannot measure, and the title keeps the row's full width.
 */
@Component({
  selector: 'mn-generation-job-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonDirective, IconComponent, ListRowComponent],
  template: `
    <mn-list-row [routerLink]="['/generate', job().id]" [state]="libraryOriginState">
      <span mn-list-row-leading class="mn-icon-badge" aria-hidden="true">
        <mn-icon name="generate" />
      </span>
      <span mn-list-row-title>{{ title() }}</span>
      <!-- The status leads the line, so it survives a long stage. -->
      <span mn-list-row-meta>{{ stateLabel() }} · {{ stageLabel() }}</span>
      <span mn-list-row-menu>
        <button
          mnButton="icon"
          type="button"
          data-testid="dismiss-generation"
          [attr.aria-label]="dismissLabel()"
          (click)="dismissRequested.emit(job())"
        >
          <mn-icon name="close" />
        </button>
      </span>
    </mn-list-row>
  `,
})
export class GenerationJobCardComponent {
  protected readonly libraryOriginState = navigationOriginState('/library');
  readonly job = input.required<GenerationJob>();
  readonly dismissRequested = output<GenerationJob>();

  /** The premise, since a story has no title until it has been written. */
  protected readonly title = computed(() => {
    const premise = this.job().premise;
    return premise === '' ? 'Untitled story' : premise;
  });

  private readonly state = computed(() => this.job().store.state());

  /** Whether the run ended with something only the learner can resolve. */
  protected readonly needsAttention = computed(() => !this.job().store.isBusy());

  protected readonly stateLabel = computed(() =>
    this.needsAttention() ? 'Needs attention' : 'Writing…',
  );

  /** Names what the control does now, since it stops a run or clears a result. */
  protected readonly dismissLabel = computed(() =>
    this.needsAttention() ? `Dismiss ${this.title()}` : `Stop writing ${this.title()}`,
  );

  /**
   * The same wording the wait screen uses, so the row and the screen it leads
   * to cannot describe the same run differently.
   */
  protected readonly stageLabel = computed(() => generationWaitCopy(this.state()).title);
}
