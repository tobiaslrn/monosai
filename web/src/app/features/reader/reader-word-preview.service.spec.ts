import type { TemplateRef, ViewContainerRef } from '@angular/core';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReaderSelectionStore } from '../../application/reading/reader-selection.store';
import { PopoverService } from '../../shared-ui/popover/popover.service';
import type { TokenActivation } from './reader-sentence.component';
import { PREVIEW_DELAY_MS, ReaderWordPreviewService } from './reader-word-preview.service';

const activation = {
  sentence: { sentence: { id: 's1' } },
  token: { id: 't1' },
  word: { tokens: [] },
  origin: document.createElement('button'),
} as unknown as TokenActivation;

describe('ReaderWordPreviewService', () => {
  const anythingOpen = signal(false);
  const selection = {
    anythingOpen,
    previewWord: vi.fn(),
    clearPreview: vi.fn(),
  };
  const ref = { close: vi.fn() };
  const popover = { open: vi.fn(() => ref) };
  const template = {} as TemplateRef<unknown>;
  const viewContainerRef = {} as ViewContainerRef;
  let preview: ReaderWordPreviewService;

  beforeEach(() => {
    vi.useFakeTimers();
    anythingOpen.set(false);
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        ReaderWordPreviewService,
        { provide: ReaderSelectionStore, useValue: selection },
        { provide: PopoverService, useValue: popover },
      ],
    });
    preview = TestBed.inject(ReaderWordPreviewService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('marks the word at once and opens its card after a pause', () => {
    preview.show(activation, template, viewContainerRef);
    expect(preview.word()).toEqual({ sentenceId: 's1', tokenId: 't1' });
    expect(popover.open).not.toHaveBeenCalled();

    vi.advanceTimersByTime(PREVIEW_DELAY_MS);

    expect(selection.previewWord).toHaveBeenCalledWith(activation.word);
    expect(popover.open).toHaveBeenCalledWith(
      expect.objectContaining({ template, viewContainerRef, modal: false }),
    );
  });

  it('opens nothing for a pointer that moved on before the pause was over', () => {
    preview.show(activation, template, viewContainerRef);
    preview.end();
    vi.advanceTimersByTime(PREVIEW_DELAY_MS);

    expect(preview.word()).toBeNull();
    expect(popover.open).not.toHaveBeenCalled();
    expect(selection.clearPreview).toHaveBeenCalled();
  });

  it('never previews over something the learner opened', () => {
    anythingOpen.set(true);
    preview.show(activation, template, viewContainerRef);
    vi.advanceTimersByTime(PREVIEW_DELAY_MS);

    expect(preview.word()).toBeNull();
    expect(popover.open).not.toHaveBeenCalled();
  });

  it('closes the card it opened when the preview ends', () => {
    preview.show(activation, template, viewContainerRef);
    vi.advanceTimersByTime(PREVIEW_DELAY_MS);
    preview.end();

    expect(ref.close).toHaveBeenCalled();
  });

  it('closes an open card when the page goes', () => {
    preview.show(activation, template, viewContainerRef);
    vi.advanceTimersByTime(PREVIEW_DELAY_MS);

    TestBed.resetTestingModule();

    expect(ref.close).toHaveBeenCalledOnce();
  });

  it('opens nothing after the page has gone', () => {
    preview.show(activation, template, viewContainerRef);

    TestBed.resetTestingModule();
    vi.advanceTimersByTime(PREVIEW_DELAY_MS);

    expect(popover.open).not.toHaveBeenCalled();
    expect(selection.previewWord).not.toHaveBeenCalled();
  });
});
