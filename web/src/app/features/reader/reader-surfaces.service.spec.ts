import type { TemplateRef, ViewContainerRef } from '@angular/core';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReaderSelectionStore } from '../../application/reading/reader-selection.store';
import { ReaderStore } from '../../application/reading/reader.store';
import { WordInspectorStore } from '../../application/reading/word-inspector.store';
import { PopoverService } from '../../shared-ui/popover/popover.service';
import type { SentenceSelection } from './paragraph-gestures.directive';
import { ReaderGeometryService } from './reader-geometry.service';
import type { TokenActivation } from './reader-sentence.component';
import { ReaderSurfacesService } from './reader-surfaces.service';
import { ReaderWordPreviewService } from './reader-word-preview.service';

const origin = document.createElement('button');
const sentenceEntry = {
  sentence: { id: 's1', japaneseText: '猫です。' },
  tokens: [],
  statuses: null,
};

function press(modality: 'mouse' | 'touch', clickCount = 1): TokenActivation {
  return {
    sentence: sentenceEntry,
    token: { id: 't1' },
    word: { tokens: [] },
    origin,
    modality,
    clickCount,
  } as unknown as TokenActivation;
}

function line(modality: 'mouse' | 'touch', sentenceId = 's1'): SentenceSelection {
  return { sentenceId, modality, x: 1, y: 2 };
}

describe('ReaderSurfacesService', () => {
  const openSentence = signal<string | null>(null);
  const openWord = signal<unknown>(null);
  const popover = { open: vi.fn(() => ({})), close: vi.fn() };
  const selection = {
    sentenceId: openSentence,
    inspectedSentenceAids: signal({ grammar: null, grammarStale: false }),
    selectSentence: vi.fn((id: string) => {
      openSentence.set(id);
    }),
    clearSentence: vi.fn(),
    openWord: vi.fn(),
    closeWord: vi.fn(),
  };
  const geometry = {
    sentenceElement: vi.fn(() => null),
    placementFor: vi.fn(() => undefined),
    keepClearOfSheet: vi.fn(),
    releaseSheet: vi.fn(),
  };
  const preview = { show: vi.fn(), end: vi.fn() };
  let surfaces: ReaderSurfacesService;

  beforeEach(() => {
    vi.clearAllMocks();
    openSentence.set(null);
    openWord.set(null);
    TestBed.configureTestingModule({
      providers: [
        ReaderSurfacesService,
        {
          provide: ReaderStore,
          useValue: { paragraphs: signal([{ sentences: [sentenceEntry] }]) },
        },
        { provide: ReaderSelectionStore, useValue: selection },
        { provide: WordInspectorStore, useValue: { selected: openWord } },
        { provide: PopoverService, useValue: popover },
        { provide: ReaderGeometryService, useValue: geometry },
        { provide: ReaderWordPreviewService, useValue: preview },
      ],
    });
    surfaces = TestBed.inject(ReaderSurfacesService);
    const template = signal({} as TemplateRef<unknown>);
    surfaces.connect({
      word: template,
      preview: template,
      sentence: template,
      viewContainerRef: {} as ViewContainerRef,
    });
  });

  it('opens a word after closing what was open, without returning focus', () => {
    surfaces.inspect(press('mouse'));

    expect(popover.close).toHaveBeenCalledWith(false);
    expect(selection.openWord).toHaveBeenCalledOnce();
    expect(popover.open).toHaveBeenCalledOnce();
  });

  it('keeps an open word for a touch and for the rest of a double-click', () => {
    openWord.set({ sentence: { id: 's1' }, token: { id: 't1' } });

    surfaces.inspect(press('touch'));
    surfaces.inspect(press('mouse', 2));

    expect(popover.close).not.toHaveBeenCalled();
    expect(popover.open).not.toHaveBeenCalled();
  });

  it('puts an open word away on a second mouse click', () => {
    openWord.set({ sentence: { id: 's1' }, token: { id: 't1' } });

    surfaces.inspect(press('mouse'));

    expect(popover.close).toHaveBeenCalledWith();
    expect(popover.open).not.toHaveBeenCalled();
  });

  it('ignores a press on a sentence that is not mounted', () => {
    surfaces.selectSentence(line('mouse', 'elsewhere'));

    expect(popover.open).not.toHaveBeenCalled();
  });

  it('opens a sentence, and resolves its text', () => {
    surfaces.selectSentence(line('mouse'));

    expect(selection.selectSentence).toHaveBeenCalledWith('s1');
    expect(popover.open).toHaveBeenCalledOnce();
    expect(surfaces.selectedSentenceText()).toBe('猫です。');
  });

  it('keeps an open sentence for a touch and puts it away for a mouse', () => {
    openSentence.set('s1');

    surfaces.selectSentence(line('touch'));
    expect(popover.close).not.toHaveBeenCalled();

    surfaces.selectSentence(line('mouse'));
    expect(popover.close).toHaveBeenCalledWith();
    expect(popover.open).not.toHaveBeenCalled();
  });

  it('moves from the inspected word to its sentence, returning focus to the word', () => {
    surfaces.openInspectedSentence();
    expect(popover.open).not.toHaveBeenCalled();

    surfaces.inspect(press('mouse'));
    popover.open.mockClear();
    surfaces.openInspectedSentence();

    expect(popover.open).toHaveBeenCalledWith(expect.objectContaining({ returnFocusTo: origin }));
  });
});
