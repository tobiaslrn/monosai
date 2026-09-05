import { Injectable, computed, inject, signal } from '@angular/core';
import { NO_AIDS, SentenceAidsStore } from '../enrichment/sentence-aids.store';
import type { Sentence } from '../../domain/reading/text-hierarchy';
import type { Token } from '../../domain/reading/token';
import type { TokenStatusAssignment } from '../../domain/reading/validation';
import type { SentenceId } from '../../domain/shared/ids';
import type { WordGroup } from '../../domain/reading/token-grouping';
import { ReaderAudioStore } from './reader-audio.store';
import { ReaderStore } from './reader.store';
import { WordInspectorStore } from './word-inspector.store';

/** What a word activation carries into a lookup, independent of how it was made. */
export interface WordLookupRequest {
  readonly token: Token;
  readonly word: WordGroup;
  readonly sentence: Sentence;
  readonly status: TokenStatusAssignment | null;
}

/**
 * What the reader has selected, and the aid requests that act on it.
 *
 * A sentence is opened by press, by double tap, or from a focused word, and a
 * word is opened by press or by keyboard — but once open, the four things that
 * can be asked for are the same four every time: an English translation, a
 * grammar analysis, a clip, and playing that clip. Each of them also has to
 * re-read the reading's summaries afterwards, because the row the menu counts
 * has just changed.
 *
 * The component was carrying all of that alongside where the popover goes. Only
 * the placement is about the page; which sentence is selected, and what happens
 * when something is asked for it, is not.
 */
@Injectable()
export class ReaderSelectionStore {
  private readonly reader = inject(ReaderStore);
  private readonly aids = inject(SentenceAidsStore);
  private readonly audio = inject(ReaderAudioStore);
  private readonly inspector = inject(WordInspectorStore);

  private readonly sentenceIdSignal = signal<SentenceId | null>(null);

  /** The open sentence, or null when no sentence card is showing. */
  readonly sentenceId = this.sentenceIdSignal.asReadonly();

  /** The aids stored for the open sentence, which is what its card renders. */
  readonly sentenceAids = computed(() => {
    const id = this.sentenceIdSignal();
    return id === null ? NO_AIDS : (this.aids.aids().get(id) ?? NO_AIDS);
  });

  /** The aids stored for the sentence the open word belongs to. */
  readonly inspectedSentenceAids = computed(() => {
    const selected = this.inspector.selected();
    return selected === null ? NO_AIDS : (this.aids.aids().get(selected.sentence.id) ?? NO_AIDS);
  });

  readonly inspectedWord = computed(() => {
    const selected = this.inspector.selected();
    return selected === null
      ? null
      : { sentenceId: selected.sentence.id, tokenId: selected.token.id };
  });

  readonly wordOpen = computed(() => this.inspector.isOpen());

  /** True while any detail surface owns the reader's attention. */
  readonly anythingOpen = computed(() => this.wordOpen() || this.sentenceIdSignal() !== null);

  selectSentence(sentenceId: SentenceId): void {
    this.sentenceIdSignal.set(sentenceId);
  }

  clearSentence(): void {
    this.sentenceIdSignal.set(null);
  }

  isSelected(sentenceId: SentenceId): boolean {
    return this.sentenceIdSignal() === sentenceId;
  }

  /** Looks a word up locally. Nothing here reaches a provider. */
  openWord(request: WordLookupRequest): void {
    void this.inspector.inspect(request);
  }

  closeWord(): void {
    this.inspector.close();
  }

  previewWord(word: WordGroup): void {
    void this.inspector.previewWord(word);
  }

  clearPreview(): void {
    this.inspector.clearPreview();
  }

  /** Translates the open sentence, because it was asked for. */
  translateSentence(): void {
    const id = this.sentenceIdSignal();
    if (id === null) return;
    void this.aids.translateSentence(id).then(() => this.reader.refreshSummaries());
  }

  /** Analyses the open sentence, because it was asked for. */
  analyzeSentence(): void {
    const id = this.sentenceIdSignal();
    if (id === null) return;
    void this.aids.analyzeGrammar(id).then(() => this.reader.refreshSummaries());
  }

  /**
   * Synthesizes the open sentence, because it was asked for.
   *
   * Producing a clip never plays it: the card then offers Play, which is a
   * second explicit action. Playback is told about the new clip so that offer
   * is real rather than a button that finds nothing.
   */
  synthesizeSentence(): void {
    const id = this.sentenceIdSignal();
    if (id === null) return;
    void this.aids.synthesizeSentence(id).then(async () => {
      await this.reader.refreshSummaries();
      const reading = this.reader.reading();
      if (reading !== null) {
        await this.audio.playback.prepare(reading);
      }
    });
  }

  /** Plays the open sentence and stops at its end. */
  playSentence(): void {
    const id = this.sentenceIdSignal();
    if (id !== null) {
      void this.audio.playback.playSentence(id);
    }
  }
}
