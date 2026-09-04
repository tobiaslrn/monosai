import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { GrammarProfileStore } from '../../application/grammar/grammar-profile.store';
import { CLOCK } from '../../application/shared/repository-tokens';
import { VocabularyAvailabilityStore } from '../../application/vocabulary/vocabulary-availability.store';
import { navigationOriginState } from '../../core/routing/navigation-history.service';
import {
  generationShortfallLabel,
  readingLevelPhrase,
  vocabularyCountLabel,
  vocabularySourceSummary,
  vocabularySyncedLabel,
} from '../../shared-ui/vocabulary-standing/vocabulary-standing';

/**
 * Where the learner stands, on the screen they look at most.
 *
 * This is the line no other Japanese reading application can show: Monosai
 * knows which words *this* learner has reviewed, and everything it writes is
 * pitched at them. Stating it above the shelf is what makes New story
 * self-explanatory — a story from *these* words — and it is the reason the
 * learner profile is worth a destination at all.
 *
 * Two lines, always the same two lines. Every state of the snapshot read fills
 * them; none of them adds, removes, or moves one, so the block is laid out
 * identically before, during, and after it resolves.
 */
@Component({
  selector: 'mn-library-standing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent],
  template: `
    <a
      class="standing"
      routerLink="/reading-level"
      [state]="libraryOriginState"
      data-testid="library-standing"
    >
      @if (headline(); as line) {
        <span class="headline">
          <span>{{ line }}</span>
          <mn-icon name="chevron-right" [size]="20" />
        </span>
        <span class="detail">{{ detail() }}</span>
      }
    </a>
  `,
  styles: `
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
      gap: var(--space-1);
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
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.02em;
      line-height: 1.25;
    }

    /* The chevron is what says this line is a way somewhere, since the words
       themselves are a statement rather than a label. */
    .headline mn-icon {
      flex: none;
      color: var(--text-secondary);
      transition: transform var(--motion-fast) ease-out;
    }

    .standing:hover .headline span {
      text-decoration: underline;
    }

    .standing:hover .headline mn-icon {
      color: var(--text-primary);
      transform: translateX(2px);
    }

    .standing:focus-visible {
      outline: 3px solid var(--focus-ring);
      outline-offset: 4px;
      border-radius: var(--radius-control);
    }

    @media (prefers-reduced-motion: reduce) {
      .headline mn-icon {
        transition: none;
      }

      .standing:hover .headline mn-icon {
        transform: none;
      }
    }

    .detail {
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    @media (max-width: 599px) {
      .headline {
        font-size: 20px;
      }
    }
  `,
})
export class LibraryStandingComponent {
  protected readonly libraryOriginState = navigationOriginState('/library');
  private readonly vocabulary = inject(VocabularyAvailabilityStore);
  private readonly grammar = inject(GrammarProfileStore);
  private readonly clock = inject(CLOCK);

  /**
   * One sentence, not two facts stapled together.
   *
   * The count and the level are the same fact from the learner's side — how
   * hard a story Monosai can write for them — so they are said as one clause.
   * The level is dropped rather than guessed at while the language bundle is
   * still loading; the sentence stays a sentence either way.
   *
   * Null only while the read has not answered, which holds the space blank.
   */
  protected readonly headline = computed<string | null>(() => {
    const state = this.vocabulary.state();
    switch (state.kind) {
      case 'unknown':
        return null;
      case 'unavailable':
        return 'Your words could not be read.';
      case 'known': {
        if (state.snapshot === null || state.snapshot.uniqueEntryCount === 0) {
          return 'No words yet.';
        }
        const count = vocabularyCountLabel(state.snapshot.uniqueEntryCount);
        const level = readingLevelPhrase(this.grammar.selectedPreset()?.id);
        return level === null ? `You can read ${count}.` : `You can read ${count} ${level}.`;
      }
    }
  });

  protected readonly detail = computed(() => this.vocabularyDetail(this.vocabulary.state()) ?? '');

  constructor() {
    void this.vocabulary.refresh();
    void this.grammar.load();
  }

  private vocabularyDetail(state: ReturnType<VocabularyAvailabilityStore['state']>): string | null {
    switch (state.kind) {
      case 'unknown':
        return null;
      case 'unavailable':
        return 'Nothing was changed.';
      case 'known': {
        const snapshot = state.snapshot;
        if (snapshot === null) {
          return 'Connect Anki to write stories from your own words.';
        }
        if (snapshot.uniqueEntryCount === 0) {
          return 'A source is connected but has no words in it yet.';
        }
        // Below the floor, the shortfall is the more useful of the two: where
        // the words came from does not help anyone who cannot generate yet.
        return (
          generationShortfallLabel(snapshot.uniqueEntryCount) ??
          `From ${vocabularySourceSummary(snapshot.sourceKinds)} · ${vocabularySyncedLabel(snapshot.createdAt, this.clock.now())}`
        );
      }
    }
  }
}
