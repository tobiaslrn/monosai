import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { GrammarProfileStore } from '../../application/grammar/grammar-profile.store';
import { LanguageStore } from '../../application/language/language.store';
import { VocabularyAvailabilityStore } from '../../application/vocabulary/vocabulary-availability.store';
import { navigationOriginState } from '../../core/routing/navigation-history.service';
import { CountingCountComponent } from '../../shared-ui/counting-count/counting-count.component';
import { StandingComponent } from '../../shared-ui/standing/standing.component';
import {
  readingLevelName,
  vocabularyCountLabel,
} from '../../shared-ui/vocabulary-standing/vocabulary-standing';

/** The level clause: still coming, known, or established not to be coming. */
type LevelClause =
  | { readonly kind: 'pending' }
  | { readonly kind: 'known'; readonly name: string }
  | { readonly kind: 'absent' };

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
 * of it that lead somewhere look like they do. It is centred on the
 * illustration beside it, holds its space before the read answers, and states
 * the sentence whole when it does.
 */
@Component({
  selector: 'mn-library-standing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CountingCountComponent, StandingComponent],
  template: `
    @if (introduces()) {
      <!--
        A first visit: nothing saved and no words. The line says what Monosai is
        for; there is no standing to state yet, and no page behind it.
      -->
      <mn-standing testId="library-standing">
        <span>Japanese you can actually read.</span>
        <span mn-standing-detail
          >Monosai writes short stories from the words you already know.</span
        >
      </mn-standing>
    } @else {
      <mn-standing
        link="/reading-level"
        fragment="words"
        [state]="libraryOriginState"
        testId="library-standing"
        [compact]="compact()"
      >
        @if (headline(); as line) {
          @switch (line.kind) {
            @case ('standing') {
              @if (line.level !== null) {
                <span
                  ><span class="mn-standing__clause"
                    >You know <mn-counting-count [count]="line.count" [format]="wordsLabel" /></span
                  >{{ ' '
                  }}<span class="mn-standing__clause">and read {{ line.level }}.</span></span
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
        }
        @if (detail(); as note) {
          <span mn-standing-detail>{{ note }}</span>
        }
      </mn-standing>
    }
  `,
})
export class LibraryStandingComponent {
  /**
   * Whether the shelf is empty. With no words either, the line introduces
   * Monosai instead of stating a standing of nothing.
   */
  readonly firstVisit = input(false);
  /** The shelf is in use: the line is a standing line, not the opening invitation. */
  readonly compact = input(false);

  protected readonly libraryOriginState = navigationOriginState('/library');
  private readonly vocabulary = inject(VocabularyAvailabilityStore);
  private readonly grammar = inject(GrammarProfileStore);
  private readonly language = inject(LanguageStore);

  /** The one formatter that says a number of words, intermediate ones included. */
  protected readonly wordsLabel = vocabularyCountLabel;

  /**
   * The level as it is said mid-sentence, or whether it is still coming.
   *
   * The preset is chosen locally but named by the language bundle, which is
   * deliberately slower than the Library: it is megabytes, and the shelf must
   * render without it. `pending` is what that wait looks like here, and it is
   * what keeps the sentence from being stated twice. Once the bundle has
   * settled either way, a level that is still unnamed is not coming at all.
   */
  private readonly level = computed<LevelClause>(() => {
    const name = readingLevelName(this.grammar.selectedPreset()?.nameEn);
    if (name !== null) {
      return { kind: 'known', name };
    }
    const status = this.language.status();
    return status === 'ready' || status === 'failed' ? { kind: 'absent' } : { kind: 'pending' };
  });

  /**
   * One sentence, naming what the learner knows and what they read.
   *
   * The count is measured from their own collection; the level is the preset
   * they chose. Said as two clauses of one sentence, neither reads as a
   * qualifier on the other — `515 words at a basic level` had the level
   * qualifying the words, as though 515 were half-known.
   *
   * Both clauses are waited for together. Stating the count as soon as it was
   * read and appending the level when the bundle arrived meant the headline
   * rewrote itself a second or two after the learner started reading it, which
   * is the one thing a line this size cannot do. If the bundle never arrives
   * the level clause is dropped rather than guessed at, and the sentence stays
   * a sentence.
   *
   * Null while either fact is still being read, which holds the space blank.
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
        const level = this.level();
        if (level.kind === 'pending') {
          return null;
        }
        return {
          kind: 'standing',
          count: state.snapshot.uniqueEntryCount,
          level: level.kind === 'known' ? level.name : null,
        };
      }
    }
  });

  protected readonly detail = computed(() => this.vocabularyDetail(this.vocabulary.state()));

  /** A first visit with no words: say what Monosai is for. */
  protected readonly introduces = computed(() => {
    const state = this.vocabulary.state();
    return (
      this.firstVisit() &&
      state.kind === 'known' &&
      (state.snapshot === null || state.snapshot.uniqueEntryCount === 0)
    );
  });

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
