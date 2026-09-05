import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The state vocabulary both long workflows share.
 *
 * `skipped` and `retrying` exist because a stage that was not needed and a
 * stage that is being attempted again are different things, and collapsing
 * either into "pending" would make a stepper that quietly lies about what
 * happened.
 */
export type StepStatus = 'pending' | 'active' | 'complete' | 'retrying' | 'skipped' | 'failed';

export interface StepperStep {
  readonly key: string;
  readonly label: string;
  readonly status: StepStatus;
  /** Counts or an attempt number for this stage; shown beside the label. */
  readonly detail?: string;
}

const STATUS_LABELS: Record<StepStatus, string> = {
  pending: 'Not started',
  active: 'In progress',
  complete: 'Done',
  retrying: 'Retrying',
  skipped: 'Skipped',
  failed: 'Failed',
};

/**
 * A presentational stepper.
 *
 * It holds no workflow knowledge: a caller maps its own state onto steps and
 * this renders them. Two workflows with the same state vocabulary is a real
 * shared concept, so the shell lives here rather than being copied.
 *
 * Every stage carries its status as text as well as colour, because a progress
 * indicator with no words tells a screen reader nothing about how far along a
 * long run is. The list is vertical on narrow viewports and lays out
 * horizontally where there is room.
 */
@Component({
  selector: 'mn-stepper',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="steps" [attr.aria-label]="label()">
      @for (step of steps(); track step.key) {
        <li
          class="step"
          [attr.data-status]="step.status"
          [attr.aria-current]="step.status === 'active' ? 'step' : null"
        >
          <span class="marker" aria-hidden="true"></span>
          <span class="text">
            <span class="name">{{ step.label }}</span>
            <span class="status">
              {{ statusLabel(step.status) }}
              @if (step.detail) {
                <span class="detail"> · {{ step.detail }}</span>
              }
            </span>
          </span>
        </li>
      }
    </ol>
  `,
  styles: `
    .steps {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .step {
      display: flex;
      gap: var(--space-3);
      align-items: baseline;
      min-width: 0;
    }

    .marker {
      flex: none;
      width: 10px;
      height: 10px;
      border: 2px solid var(--border-strong);
      border-radius: var(--radius-pill);
      background: var(--surface-raised);
    }

    .text {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .name {
      color: var(--text-secondary);
    }

    .status {
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .step[data-status='active'] .name,
    .step[data-status='retrying'] .name {
      color: var(--text-primary);
      font-weight: 600;
    }

    .step[data-status='active'] .marker,
    .step[data-status='retrying'] .marker {
      border-color: var(--action-primary);
      background: var(--action-primary);
    }

    .step[data-status='complete'] .marker {
      border-color: var(--status-success);
      background: var(--status-success);
    }

    .step[data-status='complete'] .name {
      color: var(--status-success);
    }

    .step[data-status='failed'] .marker {
      border-color: var(--status-danger);
      background: var(--status-danger);
    }

    .step[data-status='failed'] .name {
      color: var(--status-danger);
    }

    /*
     * Skipped is marked by a hollow dashed dot rather than by dimming the text:
     * lowering the opacity of secondary text drops it under the 4.5:1 contrast
     * floor, and a stage nobody can read is worse than one that looks emphatic.
     */
    .step[data-status='skipped'] .marker {
      border-style: dashed;
      background: transparent;
    }

    /* Wide viewports lay the stages out in a row; the text stays under each. */
    @media (min-width: 900px) {
      .steps {
        flex-direction: row;
        flex-wrap: wrap;
        gap: var(--space-4);
      }

      .step {
        flex: 1 1 8rem;
        align-items: flex-start;
      }
    }
  `,
})
export class StepperComponent {
  readonly steps = input.required<readonly StepperStep[]>();
  /** Accessible name for the list, e.g. "Generation progress". */
  readonly label = input.required<string>();

  protected statusLabel(status: StepStatus): string {
    return STATUS_LABELS[status];
  }
}
