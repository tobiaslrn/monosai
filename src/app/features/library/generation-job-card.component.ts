import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { GenerationJob } from '../../application/generation/generation-jobs.store';
import { navigationOriginState } from '../../core/routing/navigation-history.service';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { generationWaitCopy } from '../generate/generation-wait.component';

/**
 * One library row for a story that is still being written, or one that stopped
 * without producing anything.
 *
 * It is deliberately the same shape and height as a reading row, so the shelf
 * is laid out identically before, during, and after a generation and nothing
 * jumps when the story lands. The row is quiet rather than empty: it names the
 * stage the run is actually in, because a bar or a spinner would promise
 * progress the pipeline cannot measure.
 */
@Component({
  selector: 'mn-generation-job-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent],
  template: `
    <article class="job-row" [class.needs-attention]="needsAttention()">
      <div class="head">
        <div class="copy">
          <h3>
            <a [routerLink]="['/generate', job().id]" [state]="libraryOriginState">
              {{ title() }}
            </a>
          </h3>
          <p class="meta">
            <span class="state">{{ stateLabel() }}</span>
            <span class="separator" aria-hidden="true">·</span>
            <span>{{ stageLabel() }}</span>
          </p>
        </div>
        <button
          type="button"
          class="dismiss"
          [attr.aria-label]="dismissLabel()"
          (click)="dismissRequested.emit(job())"
        >
          <mn-icon name="close" [size]="20" />
        </button>
      </div>
    </article>
  `,
  styles: `
    .job-row {
      position: relative;
      min-height: 76px;
      padding: var(--space-3) var(--space-1) var(--space-3) var(--space-3);
      border-bottom: 1px solid var(--border-subtle);
      background: var(--surface-sunken);
      transition: background-color var(--motion-fast) ease-out;
    }

    .head {
      display: flex;
      gap: var(--space-3);
      align-items: center;
      justify-content: space-between;
    }

    .copy {
      min-width: 0;
    }

    h3 {
      margin: 0;
      font-family: var(--font-ui);
      font-size: 18px;
      font-weight: 600;
      line-height: 1.35;
      overflow-wrap: anywhere;
    }

    /*
     * Muted, because this is not a reading yet. The state is also written out
     * beside it, so the row never depends on the colour alone to say so.
     */
    h3 a {
      color: var(--text-secondary);
      text-decoration: none;
    }

    h3 a::after {
      position: absolute;
      inset: 0;
      content: '';
    }

    .job-row:has(h3 a:focus-visible) {
      outline: 3px solid var(--focus-ring);
      outline-offset: 2px;
    }

    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1);
      align-items: center;
      margin: var(--space-1) 0 0;
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .state {
      font-weight: 600;
    }

    .needs-attention .state {
      color: var(--status-danger);
    }

    .dismiss {
      position: relative;
      z-index: 1;
      display: inline-flex;
      flex: none;
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

    .dismiss:hover {
      border-color: var(--border-subtle);
    }
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
