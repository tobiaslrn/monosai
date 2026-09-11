import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GrammarProfileStore } from '../../application/grammar/grammar-profile.store';
import { VocabularyAvailabilityStore } from '../../application/vocabulary/vocabulary-availability.store';
import { navigationOriginState } from '../../core/routing/navigation-history.service';
import { CountingCountComponent } from '../../shared-ui/counting-count/counting-count.component';
import {
  readingLevelName,
  vocabularyCountLabel,
} from '../../shared-ui/vocabulary-standing/vocabulary-standing';

/** What the headline says: a standing to state, or a single plain sentence. */
type StandingHeadline =
  | { readonly kind: 'standing'; readonly count: number; readonly level: string | null }
  | { readonly kind: 'plain'; readonly text: string };

/**
 * Where the learner stands, on the screen they look at most.
 *
 * This is the line no other Japanese reading application can show: Monosai
 * knows which words *this* learner has reviewed, and everything it writes is
 * pitched at them. Stating it above the shelf is what makes New story
 * self-explanatory — a story from *these* words — and it is the reason the
 * learner profile is worth a destination at all.
 *
 * The two facts it names are the two the page behind it holds, so each is
 * underlined where it is said: the sentence reads as a sentence, and the parts
 * of it that lead somewhere look like they do. The block holds its space
 * before the read answers, so nothing below it moves when it does.
 */
@Component({
  selector: 'mn-library-standing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, CountingCountComponent],
  template: `
    <a
      class="standing"
      routerLink="/reading-level"
      fragment="words"
      [state]="libraryOriginState"
      data-testid="library-standing"
    >
      @if (headline(); as line) {
        <span class="headline">
          @switch (line.kind) {
            @case ('standing') {
              @if (line.level !== null) {
                <span
                  >You know <mn-counting-count [count]="line.count" [format]="wordsLabel" /> and
                  read {{ line.level }}.</span
                >
              } @else {
                <span
                  >You know <mn-counting-count [count]="line.count" [format]="wordsLabel" />.</span
                >
              }
            }
            @case ('plain') {
              <span>{{ line.text }}</span>
            }
          }
        </span>
        @if (detail(); as note) {
          <span class="detail">{{ note }}</span>
        }
      }
    </a>
  `,
  styles: `
    @use '../../../styles/breakpoints' as breakpoints;

    :host {
      display: block;
      min-width: 0;
    }

    /*
     * Two lines of space are held whether or not the read has answered yet, so
     * nothing below moves when it does. A skeleton would be the alternative,
     * and the design system rules those out.
     */
    .standing {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      min-height: 3.4rem;
      min-width: 0;
      color: var(--text-primary);
      text-decoration: none;
    }

    .headline {
      display: flex;
      gap: var(--space-1);
      align-items: center;
      font-family: var(--font-ui);
      font-size: var(--text-display);
      font-weight: var(--weight-bold);
      letter-spacing: -0.035em;
      line-height: 1.04;
    }

    /*
     * The sentence is the link, and it says so under a pointer and nowhere
     * else. Marking the two facts permanently was tried: at display size two
     * underlines read as heavier than the words they were under, and the level
     * name has to stay breakable on a narrow screen, so the mark fragmented
     * across lines instead of pointing anywhere.
     */
    .standing:hover .headline span {
      text-decoration: underline;
    }

    .standing:focus-visible {
      outline: 3px solid var(--focus-ring);
      outline-offset: 4px;
      border-radius: var(--radius-control);
    }

    .detail {
      color: var(--text-secondary);
      font-size: var(--text-sm);
      line-height: 1.4;
    }

    @media (max-width: breakpoints.$narrow-max) {
      .headline {
        font-size: var(--text-2xl);
      }
    }
  `,
})
export class LibraryStandingComponent {
  protected readonly libraryOriginState = navigationOriginState('/library');
  private readonly vocabulary = inject(VocabularyAvailabilityStore);
  private readonly grammar = inject(GrammarProfileStore);

  /** The one formatter that says a number of words, intermediate ones included. */
  protected readonly wordsLabel = vocabularyCountLabel;

  /**
   * One sentence, naming what the learner knows and what they read.
   *
   * The count is measured from their own collection; the level is the preset
   * they chose. Said as two clauses of one sentence, neither reads as a
   * qualifier on the other — `515 words at a basic level` had the level
   * qualifying the words, as though 515 were half-known. The level clause is
   * dropped rather than guessed at while the language bundle is still loading,
   * and the sentence stays a sentence.
   *
   * Null only while the read has not answered, which holds the space blank.
   */
  protected readonly headline = computed<StandingHeadline | null>(() => {
    const state = this.vocabulary.state();
    switch (state.kind) {
      case 'unknown':
        return null;
      case 'unavailable':
        return { kind: 'plain', text: 'Your words could not be read.' };
      case 'known': {
        if (state.snapshot === null || state.snapshot.uniqueEntryCount === 0) {
          return { kind: 'plain', text: 'No words yet.' };
        }
        return {
          kind: 'standing',
          count: state.snapshot.uniqueEntryCount,
          level: readingLevelName(this.grammar.selectedPreset()?.nameEn),
        };
      }
    }
  });

  protected readonly detail = computed(() => this.vocabularyDetail(this.vocabulary.state()));

  constructor() {
    void this.vocabulary.refresh();
    void this.grammar.load();
  }

  /**
   * Only the states that have something to say fill the second line.
   *
   * A learner with words used to be told when they last synced. It said
   * nothing on the day they synced, which is most days, and where the words
   * came from and how current they are is stated on the page this line leads
   * to. The sentence above is the standing; the second line is for a learner
   * who cannot generate a story yet and needs to know why.
   */
  private vocabularyDetail(state: ReturnType<VocabularyAvailabilityStore['state']>): string | null {
    switch (state.kind) {
      case 'unknown':
      case 'unavailable':
        return null;
      case 'known': {
        const snapshot = state.snapshot;
        if (snapshot === null) {
          return 'Connect Anki to write stories from your own words.';
        }
        if (snapshot.uniqueEntryCount === 0) {
          return 'A source is connected but has no words in it yet.';
        }
        return null;
      }
    }
  }
}
