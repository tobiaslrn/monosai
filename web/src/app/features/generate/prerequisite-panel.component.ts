import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { navigationOriginState } from '../../core/routing/navigation-history.service';
import type {
  GrammarPresetLine,
  PrerequisiteCheck,
} from '../../application/generation/generation-prerequisites';
import { IconComponent } from '../../shared-ui/icon/icon.component';

/**
 * What is still missing before a story can be generated.
 *
 * Only unmet checks are listed, one line each, and the panel disappears once
 * there are none: a row of green ticks confirming a setup the learner completed
 * weeks ago is not information. Every line links straight to the screen that
 * fixes it, and the draft survives the trip because it lives in a root-provided
 * store.
 *
 * The grammar preset carries no check, because a preset is always set. Only its
 * advisory warning appears here, and the Generate button ignores it.
 */
@Component({
  selector: 'mn-prerequisite-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent],
  template: `
    @if (unmet().length > 0) {
      <ul class="checks">
        @for (check of unmet(); track check.id) {
          <li class="check" [attr.data-check]="check.id">
            <mn-icon name="warning" [size]="18" />
            <p class="detail">
              <strong>{{ check.label }}: </strong>{{ check.detail }}
            </p>
            @if (check.route !== '') {
              <a
                class="mn-button"
                [routerLink]="check.route"
                [queryParams]="{ from: 'generate' }"
                [state]="generateOriginState"
              >
                {{ check.actionLabel }}
              </a>
            }
          </li>
        }
      </ul>
    }

    @if (preset().warning; as warning) {
      <p class="warning" data-testid="preset-warning">
        <mn-icon name="info" [size]="16" />
        <span><span class="mn-visually-hidden">Note: </span>{{ warning }}</span>
      </p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .checks {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .check {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2) var(--space-3);
      align-items: center;
    }

    .check mn-icon {
      color: var(--status-warning);
    }

    .detail {
      flex: 1;
      min-width: 12rem;
      margin: 0;
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .warning {
      display: flex;
      gap: var(--space-2);
      align-items: flex-start;
      margin: 0;
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }
  `,
})
export class PrerequisitePanelComponent {
  protected readonly generateOriginState = navigationOriginState('/generate');
  readonly checks = input.required<readonly PrerequisiteCheck[]>();
  readonly preset = input.required<GrammarPresetLine>();

  protected readonly unmet = computed(() => this.checks().filter((check) => !check.satisfied));
}
