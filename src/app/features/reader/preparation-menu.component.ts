import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { ConfigurationReadiness } from '../../domain/ai/configuration-readiness';
import type { PreparationLayer } from '../../domain/enrichment/preparation';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { PreparationTargetsComponent } from '../../shared-ui/preparation-targets/preparation-targets.component';

/**
 * What this reading should eventually contain, in the reader header.
 *
 * Deliberately its own panel rather than a section of `mn-reader-aids`. Those
 * are device-wide render preferences that take effect the moment they change;
 * these declare per-reading content that has to be produced before it exists,
 * and putting the two in one panel would suggest they are the same kind of
 * choice. It is equally deliberately not an entry in the overflow menu, which
 * is a list of actions rather than a set of standing outcomes.
 *
 * The panel is a native popover anchored to its own button, so the top layer,
 * dismissal by `Escape` or an outside press, focus return, and closing when
 * another header panel opens are all the platform's behaviour.
 */
@Component({
  selector: 'mn-preparation-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, PreparationTargetsComponent],
  template: `
    <div>
      <button
        type="button"
        class="mn-icon-button anchor-button"
        aria-label="Prepare"
        popovertarget="mn-preparation-panel"
      >
        <mn-icon name="prepare" />
      </button>

      <div id="mn-preparation-panel" popover class="panel">
        <mn-preparation-targets
          legend="Prepare for this reading"
          [targets]="targets()"
          [audioReadiness]="audioReadiness()"
          (targetsChanged)="targetsChanged.emit($event)"
        />
      </div>
    </div>
  `,
  styles: `
    .anchor-button {
      anchor-name: --mn-preparation-anchor;
    }

    /*
     * Positioned against the button rather than a wrapper, because a popover
     * is in the top layer and no longer has an ancestor to be absolute inside.
     */
    .panel {
      position: absolute;
      position-anchor: --mn-preparation-anchor;
      /*
       * All-physical keywords: position-area refuses a mix of physical and
       * logical ones. The popover user-agent style pins inset to zero to centre
       * a dialog, which has to be released before the area applies.
       */
      position-area: bottom span-left;
      inset: auto;
      width: min(20rem, calc(100vw - 2 * var(--space-4)));
      margin: var(--space-2) 0 0;
      padding: var(--space-4);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-card);
      background: var(--surface-panel);
      box-shadow: var(--shadow-overlay);
    }

    .panel:not(:popover-open) {
      display: none;
    }
  `,
})
export class PreparationMenuComponent {
  readonly targets = input.required<readonly PreparationLayer[]>();
  readonly audioReadiness = input<ConfigurationReadiness>('not-configured');

  readonly targetsChanged = output<readonly PreparationLayer[]>();
}
