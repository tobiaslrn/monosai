import type { Signal, TemplateRef, ViewContainerRef } from '@angular/core';
import { Injectable, computed, inject } from '@angular/core';
import { ReaderSelectionStore } from '../../application/reading/reader-selection.store';
import { ReaderStore, type ReaderSentence } from '../../application/reading/reader.store';
import { WordInspectorStore } from '../../application/reading/word-inspector.store';
import type { SentenceId } from '../../domain/shared/ids';
import { PopoverService } from '../../shared-ui/popover/popover.service';
import type { SentenceSelection } from './paragraph-gestures.directive';
import { ReaderGeometryService } from './reader-geometry.service';
import type { TokenActivation } from './reader-sentence.component';
import { unknownWordsIn, wordGrammarFor } from './reader-selection-view';
import { ReaderWordPreviewService } from './reader-word-preview.service';
import type { UnknownWord } from './sentence-popover.component';
import { NO_WORD_GRAMMAR, type WordGrammarState } from './word-inspector.component';

/**
 * The word buttons, which a press reaches even while a surface is open.
 *
 * Restricted to real buttons: punctuation and whitespace carry the same class
 * but are not words, and a press on one is a press on the line.
 */
const WORD_TARGET = 'button.token';

/** The page's own templates and place in the view, which a surface opens from. */
export interface ReaderSurfaceTemplates {
  readonly word: Signal<TemplateRef<unknown>>;
  readonly preview: Signal<TemplateRef<unknown>>;
  readonly sentence: Signal<TemplateRef<unknown>>;
  readonly viewContainerRef: ViewContainerRef;
}

/**
 * What a press on the reading opens: word details, sentence details, and the
 * hover preview, and how one gives way to the next.
 *
 * Provided by the reader page, which hands over its templates with `connect`.
 */
@Injectable()
export class ReaderSurfacesService {
  private readonly store = inject(ReaderStore);
  private readonly selection = inject(ReaderSelectionStore);
  private readonly inspector = inject(WordInspectorStore);
  private readonly popover = inject(PopoverService);
  private readonly geometry = inject(ReaderGeometryService);
  private readonly wordPreview = inject(ReaderWordPreviewService);

  private templates: ReaderSurfaceTemplates | null = null;
  private inspectedActivation: TokenActivation | null = null;

  /** Every mounted sentence by id, for resolving what a press selected. */
  private readonly sentencesById = computed(() => {
    const byId = new Map<string, ReaderSentence>();
    for (const paragraph of this.store.paragraphs()) {
      for (const sentence of paragraph.sentences) {
        byId.set(sentence.sentence.id, sentence);
      }
    }
    return byId;
  });

  private readonly selectedSentence = computed(() => {
    const sentenceId = this.selection.sentenceId();
    return sentenceId === null ? undefined : this.sentencesById().get(sentenceId);
  });

  readonly selectedSentenceText = computed(
    () => this.selectedSentence()?.sentence.japaneseText ?? '',
  );

  readonly selectedUnknownWords = computed<readonly UnknownWord[]>(() =>
    unknownWordsIn(this.selectedSentence()),
  );

  readonly wordGrammar = computed<WordGrammarState>(() => {
    const selected = this.inspector.selected();
    return selected === null
      ? NO_WORD_GRAMMAR
      : wordGrammarFor(selected.token, this.selection.inspectedSentenceAids());
  });

  connect(templates: ReaderSurfaceTemplates): void {
    this.templates = templates;
  }

  /** Clears every surface whose content belongs to the current reading. */
  closeAll(): void {
    this.wordPreview.end();
    this.geometry.releaseSheet();
    this.popover.close();
    this.selection.clearSentence();
  }

  /**
   * Opens a sentence where it was pressed.
   *
   * Opening costs nothing: the popover shows the stored translation, or the
   * button that would fetch one. A stray press on a line is free.
   */
  selectSentence(selection: SentenceSelection): void {
    const sentence = this.sentencesById().get(selection.sentenceId);
    if (sentence === undefined) {
      return;
    }
    if (this.selection.sentenceId() === sentence.sentence.id) {
      if (selection.modality === 'touch') {
        // Holding the same line again is a reader confirming where they are,
        // not asking for the sheet in front of them to disappear. A finger
        // dismisses by tapping the page, which is one short gesture rather
        // than half a second of holding still.
        return;
      }
      // A mouse click on the open sentence puts it away, as a click on the
      // open word does.
      this.popover.close();
      return;
    }
    this.wordPreview.end();
    this.openSentence(
      sentence.sentence.id,
      this.geometry.sentenceElement(sentence.sentence.id) ?? { x: selection.x, y: selection.y },
      undefined,
      selection.y,
    );
  }

  /**
   * Pins word details in a popover anchored to the word itself.
   *
   * Everything shown is local, so this stays a lookup in the bundled dictionary
   * and never a request. Focus returns to the token when the popover closes.
   */
  inspect(activation: TokenActivation): void {
    const templates = this.templates;
    if (templates === null) {
      return;
    }
    const open = this.inspector.selected();
    if (
      open !== null &&
      open.sentence.id === activation.sentence.sentence.id &&
      open.token.id === activation.token.id
    ) {
      if (activation.modality === 'touch' || (activation.clickCount ?? 1) > 1) {
        // Touch: tapping the word already open changes nothing. A finger is
        // imprecise and a reader often lands on the same word twice on the way
        // to reading about it; taking the sheet away underneath them was the
        // single most confusing thing a tap could do. The rest of a mouse
        // double-click belongs to the intent that opened the lookup.
        return;
      }
      // A mouse click on the open word puts it away. Reopening it would replay
      // the card's entrance over the same word and leave a reader who meant to
      // dismiss it exactly where they started.
      this.popover.close();
      return;
    }
    this.wordPreview.end();
    // Before the new word is set, because closing the surface over the old one
    // clears the selection, and a close that ran afterwards would clear this.
    // Focus is not returned: the next surface is already on its way.
    this.popover.close(false);
    this.inspectedActivation = activation;
    this.selection.openWord({
      token: activation.token,
      word: activation.word,
      sentence: activation.sentence.sentence,
      status: activation.sentence.statuses?.get(activation.token.id) ?? null,
    });

    const surface = this.popover.open({
      origin: activation.origin,
      template: templates.word(),
      viewContainerRef: templates.viewContainerRef,
      returnFocusTo: activation.origin,
      closeOnScroll: true,
      // Moving on to the next word is one press, not one to put this card away
      // and a second to open the next.
      retargetSelector: WORD_TARGET,
      onClosed: () => {
        this.geometry.releaseSheet();
        this.inspectedActivation = null;
        this.selection.closeWord();
      },
    });
    this.geometry.keepClearOfSheet(activation.origin, surface);
  }

  /** Keyboard route from a focused word to every action on its sentence. */
  openInspectedSentence(): void {
    const activation = this.inspectedActivation;
    if (activation === null) {
      return;
    }
    this.openSentence(
      activation.sentence.sentence.id,
      this.geometry.sentenceElement(activation.sentence.sentence.id) ?? activation.origin,
      activation.origin,
    );
  }

  previewWord(activation: TokenActivation): void {
    const templates = this.templates;
    if (templates !== null) {
      this.wordPreview.show(activation, templates.preview(), templates.viewContainerRef);
    }
  }

  private openSentence(
    sentenceId: SentenceId,
    origin: { x: number; y: number } | HTMLElement,
    returnFocusTo?: HTMLElement | null,
    pressedAtY?: number,
  ): void {
    const templates = this.templates;
    if (templates === null) {
      return;
    }
    // For the same reason as a word: the closing surface clears the selection,
    // so whatever is open goes first and the new sentence is set after it.
    // Without returning focus, because another surface is opening in its place.
    this.popover.close(false);
    this.selection.selectSentence(sentenceId);
    const surface = this.popover.open({
      origin,
      template: templates.sentence(),
      viewContainerRef: templates.viewContainerRef,
      returnFocusTo: returnFocusTo ?? this.geometry.sentenceElement(sentenceId),
      closeOnScroll: true,
      preferredVerticalPlacement: this.geometry.placementFor(origin),
      // A press on a word is about that word, whatever is open at the time.
      retargetSelector: WORD_TARGET,
      onClosed: () => {
        this.geometry.releaseSheet();
        this.selection.clearSentence();
      },
    });
    this.geometry.keepClearOfSheet(
      origin instanceof HTMLElement ? origin : this.geometry.sentenceElement(sentenceId),
      surface,
      pressedAtY,
    );
  }
}
