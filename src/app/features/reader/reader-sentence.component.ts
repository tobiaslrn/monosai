import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { ReaderSentence } from '../../application/reading/reader.store';
import type { Token } from '../../domain/reading/token';
import { ReaderTokenComponent } from './reader-token.component';

export interface TokenActivation {
  readonly sentence: ReaderSentence;
  readonly token: Token;
}

/**
 * One sentence of the reading.
 *
 * The rendered sentence is rebuilt from the stored token slices in order, so
 * spacing and furigana are presentation only and the underlying Japanese is
 * never rewritten.
 */
@Component({
  selector: 'mn-reader-sentence',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReaderTokenComponent],
  template: `
    <span
      class="sentence"
      lang="ja"
      [class.is-spaced]="tokenSpacing()"
      [class.is-current]="current()"
      [attr.data-sentence-id]="entry().sentence.id"
    >
      @for (token of entry().tokens; track token.id) {
        <mn-reader-token
          [token]="token"
          [status]="entry().statuses?.get(token.id) ?? null"
          [showFurigana]="furigana()"
          [showMarkers]="markers()"
          [selected]="selectedTokenId() === token.id"
          (activated)="onActivated($event)"
          (previewed)="previewed.emit({ sentence: entry(), token: $event })"
        />
      }
    </span>
  `,
  styles: `
    :host {
      display: inline;
    }

    .sentence.is-spaced mn-reader-token {
      margin-inline-end: 0.22em;
    }

    .sentence.is-current {
      /*
       * A left rule rather than a background: it marks the reading position
       * without tinting the Japanese it sits behind.
       */
      box-shadow: -0.4em 0 0 -0.28em var(--action-primary);
    }
  `,
})
export class ReaderSentenceComponent {
  readonly entry = input.required<ReaderSentence>();
  readonly furigana = input(true);
  readonly tokenSpacing = input(true);
  readonly markers = input(true);
  readonly current = input(false);
  readonly selectedTokenId = input<string | null>(null);

  readonly activated = output<TokenActivation>();
  readonly previewed = output<TokenActivation>();

  protected onActivated(token: Token): void {
    this.activated.emit({ sentence: this.entry(), token });
  }
}
