import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * What a long task is doing right now, as a heading with dots counting up
 * after it and an optional detail beneath.
 *
 *   @for (message of [copy()]; track message.key) {
 *     <mn-working [heading]="message.title" [detail]="message.detail" />
 *   }
 *
 * It fades in when it is created, so a caller that recreates it on each new
 * stage (keyed as above) has every stage arrive rather than swap. The dots
 * are laid out at their full width and uncovered from the left, so the line
 * never reflows while they count.
 */
@Component({
  selector: 'mn-working',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>
      <span class="status-title">{{ heading() }}</span
      ><span class="loading-dots" aria-hidden="true"
        ><span class="loading-dots__reveal">...</span></span
      >
    </h2>
    @if (detail()) {
      <p>{{ detail() }}</p>
    }
  `,
  styles: `
    :host {
      display: block;
      max-width: var(--page-measure);
      text-align: center;
      animation: working-in var(--motion-medium) var(--ease-standard);
    }

    h2 {
      margin: 0;
      font-size: var(--text-2xl);
      letter-spacing: -0.025em;
    }

    .loading-dots {
      display: inline-block;
      width: 0.9em;
      text-align: left;
      vertical-align: bottom;
    }

    .loading-dots__reveal {
      display: inline-block;
      width: 0.9em;
      vertical-align: bottom;
      white-space: nowrap;
      clip-path: inset(0 100% 0 0);
      animation: dots-reveal var(--motion-loop) steps(4, end) infinite;
    }

    p {
      margin: var(--space-3) 0 0;
      color: var(--text-secondary);
      line-height: var(--leading-relaxed);
    }

    @keyframes dots-reveal {
      to {
        clip-path: inset(0);
      }
    }

    @keyframes working-in {
      from {
        opacity: 0;
        transform: translateY(0.375rem);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      :host,
      .loading-dots__reveal {
        animation: none;
      }

      .loading-dots__reveal {
        clip-path: none;
      }
    }
  `,
})
export class WorkingComponent {
  readonly heading = input.required<string>();
  readonly detail = input<string>('');
}
