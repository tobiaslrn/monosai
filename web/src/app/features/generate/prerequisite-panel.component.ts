import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { navigationOriginState } from '../../core/routing/navigation-history.service';
import type {
  GrammarPresetLine,
  PrerequisiteCheck,
} from '../../application/generation/generation-prerequisites';
import { BlockerComponent, BlockerListComponent } from '../../shared-ui/blocker/blocker.component';
import { ButtonDirective } from '../../shared-ui/button/button';
import { StackComponent } from '../../shared-ui/layout/layout';
import { NoticeComponent } from '../../shared-ui/notice/notice.component';

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
  imports: [
    RouterLink,
    BlockerListComponent,
    BlockerComponent,
    ButtonDirective,
    NoticeComponent,
    StackComponent,
  ],
  template: `
    <mn-stack [gap]="4">
      @if (unmet().length > 0) {
        <mn-blocker-list>
          @for (check of unmet(); track check.id) {
            <mn-blocker [attr.data-check]="check.id">
              <strong>{{ check.label }}: </strong>{{ check.detail }}
              @if (check.route !== '') {
                <a
                  mn-blocker-action
                  mnButton
                  [routerLink]="check.route"
                  [queryParams]="{ from: 'generate' }"
                  [state]="generateOriginState"
                >
                  {{ check.actionLabel }}
                </a>
              }
            </mn-blocker>
          }
        </mn-blocker-list>
      }

      @if (preset().warning; as warning) {
        <mn-notice tone="info" icon="info" data-testid="preset-warning">
          <span class="mn-visually-hidden">Note: </span>{{ warning }}
        </mn-notice>
      }
    </mn-stack>
  `,
})
export class PrerequisitePanelComponent {
  protected readonly generateOriginState = navigationOriginState('/generate');
  readonly checks = input.required<readonly PrerequisiteCheck[]>();
  readonly preset = input.required<GrammarPresetLine>();

  protected readonly unmet = computed(() => this.checks().filter((check) => !check.satisfied));
}
