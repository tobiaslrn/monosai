import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type {
  GrammarPresetLine,
  PrerequisiteCheck,
} from '../../application/generation/generation-prerequisites';
import { IconComponent } from '../../shared-ui/icon/icon.component';

/**
 * The three checks generation depends on, each independently actionable.
 *
 * Every failed check links straight to the screen that fixes it, and the draft
 * survives the trip because it lives in a root-provided store. Text-to-speech
 * is named as optional and carries no state: it can never block a story, and a
 * check that never blocks anything would only add noise.
 *
 * The grammar preset is a read-only line rather than a check, because a preset
 * is always set. Its warning is advisory and the Generate button ignores it.
 */
@Component({
  selector: 'mn-prerequisite-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent],
  template: `
    <ul class="checks">
      @for (check of checks(); track check.id) {
        <li class="check" [attr.data-satisfied]="check.satisfied" [attr.data-check]="check.id">
          <mn-icon [name]="check.satisfied ? 'check' : 'warning'" [size]="18" />
          <div class="body">
            <p class="label">
              {{ check.label }}
              <span class="mn-visually-hidden">{{
                check.satisfied ? ': ready' : ': needs attention'
              }}</span>
            </p>
            <p class="detail">{{ check.detail }}</p>
            @if (!check.satisfied && check.route !== '') {
              <a class="mn-button" [routerLink]="check.route">{{ check.actionLabel }}</a>
            }
          </div>
        </li>
      }
    </ul>

    <p class="preset" data-testid="preset-line">
      Grammar preset: <strong>{{ preset().presetName }}</strong> ·
      <a [routerLink]="preset().route">Change in Grammar</a>
    </p>
    @if (preset().warning; as warning) {
      <p class="warning" data-testid="preset-warning">
        <mn-icon name="info" [size]="16" />
        <span><span class="mn-visually-hidden">Note: </span>{{ warning }}</span>
      </p>
    }

    <p class="optional" data-testid="tts-optional">
      Text to speech is optional. Stories generate and save without it, and you can add audio to a
      reading later.
    </p>
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
      gap: var(--space-4);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .check {
      display: flex;
      gap: var(--space-3);
      align-items: flex-start;
    }

    .check[data-satisfied='true'] mn-icon {
      color: var(--status-success);
    }

    .check[data-satisfied='false'] mn-icon {
      color: var(--status-warning);
    }

    .body {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      align-items: flex-start;
      min-width: 0;
    }

    .label {
      margin: 0;
      font-weight: 600;
    }

    .detail,
    .preset,
    .optional {
      margin: 0;
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .warning {
      display: flex;
      gap: var(--space-2);
      align-items: flex-start;
      margin: 0;
      color: var(--status-warning);
      font-size: var(--text-sm);
    }
  `,
})
export class PrerequisitePanelComponent {
  readonly checks = input.required<readonly PrerequisiteCheck[]>();
  readonly preset = input.required<GrammarPresetLine>();
}
