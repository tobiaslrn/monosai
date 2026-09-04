import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GrammarProfileStore } from '../../application/grammar/grammar-profile.store';
import { CLOCK } from '../../application/shared/repository-tokens';
import { VocabularyAvailabilityStore } from '../../application/vocabulary/vocabulary-availability.store';
import { navigationOriginState } from '../../core/routing/navigation-history.service';
import {
  generationShortfallLabel,
  vocabularyCountLabel,
  vocabularySourceSummary,
  vocabularySyncedLabel,
} from '../../shared-ui/vocabulary-standing/vocabulary-standing';

/**
 * Where the learner stands, on the screen they look at most.
 *
 * This is the line no other Japanese reading application can show: Monosai
 * knows which words *this* learner has reviewed, and everything it writes is
 * pitched at them. Stating it above the shelf is what makes New reading
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
  imports: [RouterLink],
  template: `
    <a
      class="standing"
      routerLink="/reading-level"
      [state]="libraryOriginState"
      data-testid="library-standing"
    >
      @if (headline(); as line) {
        <span class="headline">{{ line }}</span>
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
      font-family: var(--font-ui);
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.02em;
      line-height: 1.25;
    }

    .standing:hover .headline {
      text-decoration: underline;
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

  /** Null only while the read has not answered, which holds the space blank. */
  protected readonly headline = computed<string | null>(() => {
    const state = this.vocabulary.state();
    switch (state.kind) {
      case 'unknown':
        return null;
      case 'unavailable':
        return 'Your words could not be read.';
      case 'known':
        return state.snapshot === null || state.snapshot.uniqueEntryCount === 0
          ? 'No words yet.'
          : `You can read ${vocabularyCountLabel(state.snapshot.uniqueEntryCount)}.`;
    }
  });

  protected readonly detail = computed(() => {
    const state = this.vocabulary.state();
    const parts = [this.grammar.selectedPreset()?.nameEn, this.vocabularyDetail(state)];
    return parts.filter((part) => part !== undefined && part !== null).join(' · ');
  });

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
          `${vocabularySourceSummary(snapshot.sourceKinds)}, ${vocabularySyncedLabel(snapshot.createdAt, this.clock.now())}`
        );
      }
    }
  }
}
