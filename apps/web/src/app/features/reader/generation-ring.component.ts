import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Geometry of the ring, in the 44-unit square it is drawn in. */
const RADIUS = 19;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * A run, drawn around the control that stops it.
 *
 * A count in words underneath said what the ring and the track already say. It
 * fills the element it is placed in, which positions it, and never takes a press
 * from the control beneath.
 */
@Component({
  selector: 'mn-generation-ring',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg class="ring" viewBox="0 0 44 44" aria-hidden="true" focusable="false">
      <circle class="ring-track" cx="22" cy="22" [attr.r]="radius" />
      <circle
        class="ring-fill"
        cx="22"
        cy="22"
        [attr.r]="radius"
        [attr.stroke-dasharray]="circumference"
        [attr.stroke-dashoffset]="offset()"
      />
    </svg>
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      display: block;
      pointer-events: none;
    }

    .ring {
      display: block;
      inline-size: 100%;
      block-size: 100%;
      transform: rotate(-90deg);
    }

    .ring-track,
    .ring-fill {
      fill: none;
      stroke-width: 2;
    }

    .ring-track {
      stroke: var(--surface-sunken);
    }

    .ring-fill {
      stroke: currentcolor;
      stroke-linecap: round;
      transition: stroke-dashoffset var(--motion-medium) var(--ease-standard);
    }

    @media (prefers-reduced-motion: reduce) {
      .ring-fill {
        transition: none;
      }
    }
  `,
})
export class GenerationRingComponent {
  /** How much of the reading is done, from 0 to 1. */
  readonly fraction = input.required<number>();

  protected readonly radius = RADIUS;
  protected readonly circumference = CIRCUMFERENCE;
  protected readonly offset = computed(() => CIRCUMFERENCE * (1 - this.fraction()));
}
