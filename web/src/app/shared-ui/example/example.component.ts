import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * A sample sentence and its gloss: what a level, a form, or a choice reads
 * like. It is a quiet block set in from the words around it by a rule, not a
 * surface of its own, so the card it sits in stays the only one.
 *
 *   <mn-example ja="私は毎朝七時に起きます。" en="I get up at seven every morning." />
 */
@Component({
  selector: 'mn-example',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="ja" lang="ja">{{ ja() }}</p>
    @if (en(); as gloss) {
      <p class="en" lang="en">{{ gloss }}</p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--line-gap);
      min-width: 0;
      margin-block-start: var(--space-1);
      padding-inline-start: var(--block-inset);
      border-inline-start: 2px solid var(--border-subtle);
    }

    p {
      margin: 0;
    }

    .ja {
      font-family: var(--font-japanese);
      font-size: var(--text-lg);
      line-height: var(--leading-relaxed);
    }

    .en {
      color: var(--text-secondary);
      font-size: var(--text-sm);
      line-height: var(--leading-snug);
    }
  `,
})
export class ExampleComponent {
  readonly ja = input.required<string>();
  readonly en = input<string | null>(null);
}
