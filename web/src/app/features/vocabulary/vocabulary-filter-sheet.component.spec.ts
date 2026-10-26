import { Dialog, type DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeMatchMedia, type FakeMediaMatcher } from '../../../testing/match-media';
import { CLOCK } from '../../application/shared/repository-tokens';
import { fixedClock } from '../../domain/shared/clock';
import { DEFAULT_BROWSE_QUERY, type BrowseQuery } from '../../domain/vocabulary/vocabulary-browse';
import {
  VocabularyFilterSheetComponent,
  type VocabularyFilterSheetData,
} from './vocabulary-filter-sheet.component';

describe('VocabularyFilterSheetComponent', () => {
  let media: FakeMediaMatcher;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.overrideProvider(CLOCK, { useValue: fixedClock(1_700_000_000_000) });
    media = installFakeMatchMedia(412);
  });

  afterEach(() => {
    vi.useRealTimers();
    TestBed.inject(Dialog).closeAll();
    media.restore();
  });

  function open(): {
    readonly ref: DialogRef<BrowseQuery | undefined>;
    readonly closed: (BrowseQuery | undefined)[];
    readonly sheet: HTMLElement;
  } {
    const data: VocabularyFilterSheetData = {
      query: DEFAULT_BROWSE_QUERY,
      entries: [],
      sources: [],
    };
    const ref = TestBed.inject(Dialog).open<BrowseQuery | undefined, VocabularyFilterSheetData>(
      VocabularyFilterSheetComponent,
      { data },
    );
    const closed: (BrowseQuery | undefined)[] = [];
    ref.closed.subscribe((result) => closed.push(result));
    detect();
    const sheet = document.querySelector<HTMLElement>('mn-vocabulary-filter-sheet .sheet')!;
    return { ref, closed, sheet };
  }

  function detect(): void {
    for (const ref of TestBed.inject(Dialog).openDialogs) {
      ref.componentRef?.changeDetectorRef.detectChanges();
    }
  }

  function endSlide(sheet: HTMLElement): void {
    const event = new Event('transitionend');
    Object.defineProperty(event, 'propertyName', { value: 'transform' });
    sheet.dispatchEvent(event);
  }

  function pressEscape(): void {
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }),
    );
  }

  it('slides out before the dialog closes when dismissed from the backdrop', () => {
    const { closed, sheet } = open();

    document.querySelector<HTMLElement>('.cdk-overlay-backdrop')!.click();
    detect();

    expect(sheet.classList.contains('is-leaving')).toBe(true);
    expect(closed).toEqual([]);
    endSlide(sheet);
    expect(closed).toEqual([undefined]);
  });

  it('slides out before the dialog closes when Escape is pressed', () => {
    const { closed, sheet } = open();

    pressEscape();
    detect();

    expect(sheet.classList.contains('is-leaving')).toBe(true);
    expect(closed).toEqual([]);
    endSlide(sheet);
    expect(closed).toEqual([undefined]);
  });

  it('commits the draft only after Show has slid away', () => {
    const { closed, sheet } = open();

    sheet.querySelector<HTMLButtonElement>('.mn-button--primary')!.click();
    detect();

    expect(closed).toEqual([]);
    endSlide(sheet);
    expect(closed).toEqual([DEFAULT_BROWSE_QUERY]);
  });

  it('discards the draft when the handle dismisses it', () => {
    const { closed, sheet } = open();

    sheet.querySelector<HTMLButtonElement>('.handle')!.click();
    detect();

    expect(sheet.classList.contains('is-leaving')).toBe(true);
    endSlide(sheet);
    expect(closed).toEqual([undefined]);
  });

  it('ignores a second dismissal while it is sliding out', () => {
    const { closed, sheet } = open();

    pressEscape();
    sheet.querySelector<HTMLButtonElement>('.mn-button--primary')!.click();
    document.querySelector<HTMLElement>('.cdk-overlay-backdrop')!.click();
    endSlide(sheet);
    endSlide(sheet);

    expect(closed).toEqual([undefined]);
  });

  it('closes anyway if the slide never reports its end', () => {
    vi.useFakeTimers();
    const { closed } = open();

    pressEscape();
    expect(closed).toEqual([]);
    vi.advanceTimersByTime(500);

    expect(closed).toEqual([undefined]);
  });

  it('closes at once when the user prefers reduced motion', () => {
    media.restore();
    media = installFakeMatchMedia(412, false, true);
    const { closed } = open();

    pressEscape();

    expect(closed).toEqual([undefined]);
  });

  it('closes at once on a wide viewport, where the card does not dock', () => {
    media.setWidth(1280);
    const { closed } = open();

    pressEscape();

    expect(closed).toEqual([undefined]);
  });
});
