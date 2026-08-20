import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NO_AIDS, type SentenceAids } from '../../application/enrichment/sentence-aids.store';
import type { ReaderSentence } from '../../application/reading/reader.store';
import { tokensCoveredByConcerns } from '../../domain/enrichment/finding-spans';
import type { Token } from '../../domain/reading/token';
import { ReaderTokenComponent, type TokenActivationSource } from './reader-token.component';
import {
  SentenceGesturesDirective,
  type SentenceGestureOrigin,
} from './sentence-gestures.directive';
import { SentenceGrammarComponent } from './sentence-grammar.component';
import { SentenceTranslationComponent } from './sentence-translation.component';

/** A request to open the sentence menu, and where to put it. */
export interface SentenceMenuRequest {
  readonly sentence: ReaderSentence;
  /** Viewport coordinates for a pointer, or the element that asked. */
  readonly origin: SentenceGestureOrigin;
  /** Where focus returns to; null when the menu was opened by a pointer. */
  readonly returnFocusTo: HTMLElement | null;
}

export interface TokenActivation {
  readonly sentence: ReaderSentence;
  readonly token: Token;
  /** The token's own button, which the word popover is anchored to. */
  readonly origin: HTMLElement;
}

/**
 * One sentence of the reading, with the aids that belong under it.
 *
 * The rendered sentence is rebuilt from the stored token slices in order, so
 * spacing and furigana are presentation only and the underlying Japanese is
 * never rewritten. Aids follow the sentence as block content rather than
 * floating over it: a translation is something to read alongside the Japanese,
 * not a popup to dismiss.
 */
@Component({
  selector: 'mn-reader-sentence',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReaderTokenComponent,
    SentenceGesturesDirective,
    SentenceTranslationComponent,
    SentenceGrammarComponent,
  ],
  template: `
    <span
      class="sentence"
      lang="ja"
      mnSentenceGestures
      (menuRequested)="openMenuAt($event)"
      [class.is-spaced]="tokenSpacing()"
      [class.is-current]="current()"
      [class.has-concern]="aids().concernCount > 0"
      [attr.data-sentence-id]="entry().sentence.id"
    >
      @for (token of entry().tokens; track token.id) {
        <mn-reader-token
          [token]="token"
          [status]="entry().statuses?.get(token.id) ?? null"
          [showFurigana]="furigana()"
          [showMarkers]="markers()"
          [selected]="selectedTokenId() === token.id"
          [grammarConcern]="concernTokenIds().has(token.id)"
          (activated)="onActivated($event)"
          (previewed)="onPreviewed($event)"
          (previewEnded)="previewEnded.emit()"
        />
      }
    </span>

    <!--
      Invisible until it is focused, so a keyboard reader always has a route to
      the sentence menu while a mouse reader sees an uncluttered page.
    -->
    <button #actions type="button" class="sentence-actions" (click)="openMenuFromControl(actions)">
      Actions for sentence {{ entry().sentence.positionInReading + 1 }}
    </button>

    @if (aids().translation; as translation) {
      @if (aids().translationVisible) {
        <mn-sentence-translation [text]="translation.textEn" />
      }
    }

    @if (aids().grammar; as grammar) {
      <mn-sentence-grammar [findings]="grammar.findings" [stale]="aids().grammarStale" />
    }
  `,
  styles: `
    :host {
      display: inline;
    }

    .sentence.is-spaced mn-reader-token {
      margin-inline-end: 0.22em;
    }

    /*
     * The whole discoverability story for sentence actions: hovering says the
     * sentence is something you can act on without printing a control on the
     * page. Cloned decoration so the tint wraps cleanly across line breaks.
     */
    @media (hover: hover) {
      .sentence:hover {
        background: var(--surface-sunken);
        box-decoration-break: clone;
        -webkit-box-decoration-break: clone;
      }
    }

    /*
     * The skip-link pattern: laid out only while it has focus, so it is
     * reachable by Tab and invisible to everyone else.
     */
    .sentence-actions {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      padding: 0;
      overflow: hidden;
      border: 0;
      clip-path: inset(50%);
    }

    /*
     * Plain :focus rather than :focus-visible: the control is invisible at
     * rest, so it must lay itself out whenever it holds focus — including when
     * the popover hands focus back to it after closing, which :focus-visible
     * may not match.
     */
    .sentence-actions:focus {
      position: static;
      width: auto;
      height: auto;
      margin: 0 0 0 var(--space-1);
      padding: 0 var(--space-2);
      overflow: visible;
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-pill);
      background: var(--surface-raised);
      color: var(--text-primary);
      font-family: var(--font-ui);
      font-size: var(--text-sm);
      clip-path: none;
      cursor: pointer;
    }

    .sentence.is-current {
      /*
       * A left rule rather than a background: it marks the reading position
       * without tinting the Japanese it sits behind.
       */
      box-shadow: -0.4em 0 0 -0.28em var(--action-primary);
    }

    /*
     * A grammar concern marks the sentence, never a word, unless the analysis
     * supplied a span — the amber rule says "there is something to read about
     * this sentence" without guessing where.
     */
    .sentence.has-concern {
      box-shadow: -0.4em 0 0 -0.28em var(--status-warning);
    }

    .sentence.is-current.has-concern {
      box-shadow:
        -0.4em 0 0 -0.28em var(--action-primary),
        -0.62em 0 0 -0.28em var(--status-warning);
    }
  `,
})
export class ReaderSentenceComponent {
  readonly entry = input.required<ReaderSentence>();
  readonly aids = input<SentenceAids>(NO_AIDS);
  readonly furigana = input(true);
  readonly tokenSpacing = input(true);
  readonly markers = input(true);
  readonly current = input(false);
  readonly selectedTokenId = input<string | null>(null);

  readonly activated = output<TokenActivation>();
  readonly menuRequested = output<SentenceMenuRequest>();
  readonly previewed = output<TokenActivation>();
  readonly previewEnded = output<void>();

  protected readonly concernTokenIds = computed(() => {
    const grammar = this.aids().grammar;
    return grammar === null
      ? new Set<string>()
      : tokensCoveredByConcerns(grammar.findings, this.entry().tokens);
  });

  protected openMenuAt(origin: SentenceGestureOrigin): void {
    this.menuRequested.emit({ sentence: this.entry(), origin, returnFocusTo: null });
  }

  protected openMenuFromControl(control: HTMLElement): void {
    this.menuRequested.emit({ sentence: this.entry(), origin: control, returnFocusTo: control });
  }

  protected onActivated(activation: TokenActivationSource): void {
    this.activated.emit({ sentence: this.entry(), ...activation });
  }

  protected onPreviewed(activation: TokenActivationSource): void {
    this.previewed.emit({ sentence: this.entry(), ...activation });
  }
}
