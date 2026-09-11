import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { GenerationJob } from '../../application/generation/generation-jobs.store';
import { navigationOriginState } from '../../core/routing/navigation-history.service';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { ListRowComponent } from '../../shared-ui/list-row/list-row.component';
import { generationWaitCopy } from '../generate/generation-wait.component';

/**
 * One Home row for a story that is still being written, or one that stopped
 * without producing anything.
 *
 * It is deliberately the same shape and height as the Library row the story
 * will become. The row is quiet rather than empty: it names the
 * stage the run is actually in, because a bar or a spinner would promise
 * progress the pipeline cannot measure.
 */
@Component({
  selector: 'mn-generation-job-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, ListRowComponent],
  template: `
    <mn-list-row
      variant="muted"
      [class.needs-attention]="needsAttention()"
      [routerLink]="['/generate', job().id]"
      [state]="homeOriginState"
    >
      <span mn-list-row-leading class="mn-icon-badge" aria-hidden="true">
        <mn-icon name="generate" [size]="18" />
      </span>
      <span mn-list-row-title>{{ title() }}</span>
      <span mn-list-row-meta>{{ stageLabel() }}</span>
      <span mn-list-row-trailing>
        <span class="mn-status-pill" [class.mn-status-pill--danger]="needsAttention()">
          {{ stateLabel() }}
        </span>
      </span>
      <span mn-list-row-menu>
        <button
          type="button"
          class="mn-icon-button dismiss"
          [attr.aria-label]="dismissLabel()"
          (click)="dismissRequested.emit(job())"
        >
          <mn-icon name="close" [size]="20" />
        </button>
      </span>
    </mn-list-row>
  `,
})
export class GenerationJobCardComponent {
  protected readonly homeOriginState = navigationOriginState('/home');
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
    this.needsAttention() ? 'Needs attention' : 'Being written',
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
