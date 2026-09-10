import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { CLOCK } from '../../application/shared/repository-tokens';
import { fixedClock } from '../../domain/shared/clock';
import type { GeneratedStory, ImportedReading, Reading } from '../../domain/reading/reading';
import { readingId, snapshotId } from '../../domain/shared/ids';
import { ReadingCardComponent } from './reading-card.component';

const NOW = new Date(2026, 7, 21, 12, 0, 0).getTime();
const CREATED = new Date(2026, 7, 1, 9, 0, 0).getTime();

const BASE = {
  id: readingId('3f6d2c1a-9b4e-4a7d-8f21-0c5e7a9b1d33'),
  title: '吾輩は猫である',
  createdAt: CREATED,
  updatedAt: CREATED,
  lastOpenedAt: null,
  sentenceCount: 4,
  characterCount: 940,
  excerpt: '猫が好きです。',
  translationSummary: { total: 4, completed: 0, failed: 0 },
  grammarSummary: { state: 'not-requested' as const },
  audioSummary: { total: 4, completed: 0, failed: 0 },
  preparationTargets: [],
  analyzerVersion: '1',
};

function imported(overrides: Partial<ImportedReading> = {}): Reading {
  return {
    ...BASE,
    kind: 'imported',
    importSource: 'paste',
    sourceTextHash: 'h',
    ...overrides,
  };
}

function generated(overrides: Partial<GeneratedStory> = {}): Reading {
  return {
    ...BASE,
    kind: 'generated',
    form: 'short',
    premise: 'A girl finds a glowing stone in the river',
    snapshotId: snapshotId('snapshot-1'),
    generationProvenanceId: 'g',
    validationOutcome: { kind: 'strict' },
    ...overrides,
  };
}

function render(reading: Reading): HTMLElement {
  const fixture = TestBed.createComponent(ReadingCardComponent);
  fixture.componentRef.setInput('reading', reading);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

function textOf(reading: Reading, selector: string): string {
  return render(reading).querySelector(selector)?.textContent.replaceAll(/\s+/g, ' ').trim() ?? '';
}

describe('ReadingCardComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: CLOCK, useValue: fixedClock(NOW) }],
    });
  });

  /**
   * The premise is what a learner asked for and the one thing that says what
   * the story is. It sat in the database and was rendered nowhere.
   */
  it('shows the character count even when a generated story has a premise', () => {
    expect(textOf(generated(), '[mn-list-row-meta]')).toContain('940 characters');
  });

  it('falls back to the size when a generated story has no premise', () => {
    expect(textOf(generated({ premise: '   ' }), '[mn-list-row-meta]')).toContain('940 characters');
  });

  it('states an imported reading size even when there is a filename', () => {
    expect(textOf(imported(), '[mn-list-row-meta]')).toContain('940 characters');
    expect(
      textOf(imported({ importSource: 'text-file', sourceFileName: 'kokoro.txt' }), '[mn-list-row-meta]'),
    ).toContain('940 characters');
  });

  /**
   * The card showed `3118 characters` while Add text, two screens earlier,
   * showed `50,000 characters` for the same kind of number. One application,
   * one format.
   */
  it('groups a long reading the way the import counter does', () => {
    expect(textOf(imported({ characterCount: 3118 }), '[mn-list-row-meta]')).toContain(
      '3,118 characters',
    );
    expect(textOf(imported({ characterCount: 1 }), '[mn-list-row-meta]')).toContain('1 character');
  });

  it('names how long a reading is in the words the screen that made it uses', () => {
    expect(textOf(generated({ form: 'micro' }), '[mn-list-row-meta]')).toContain('Micro');
    expect(textOf(generated({ form: 'long' }), '[mn-list-row-meta]')).toContain('Long');
    expect(textOf(imported(), '[mn-list-row-meta]')).toContain('Pasted');
    expect(textOf(imported({ importSource: 'text-file' }), '[mn-list-row-meta]')).toContain(
      'Text file',
    );
  });

  /** When you last picked something up, not when it was filed. */
  it('reports when the reading was last read', () => {
    expect(textOf(generated({ lastOpenedAt: NOW }), '[mn-list-row-meta]')).toContain('read today');
    expect(
      textOf(
        generated({ lastOpenedAt: new Date(2026, 7, 18, 9, 0, 0).getTime() }),
        '[mn-list-row-meta]',
      ),
    ).toContain('read 3 days ago');
  });

  /**
   * Never opened is its own fact. Falling back to the date it was added would
   * answer a question nobody asked of a shelf.
   */
  it('says a reading is unread rather than reporting when it was added', () => {
    const meta = textOf(generated({ lastOpenedAt: null }), '[mn-list-row-meta]');

    expect(meta).toContain('unread');
    expect(meta).not.toContain('Aug 1');
  });

  it('marks available audio without spelling it out twice', () => {
    expect(
      textOf(
        generated({ audioSummary: { total: 4, completed: 4, failed: 0 } }),
        '[mn-list-row-meta]',
      ),
    ).toContain('Audio');
    expect(textOf(generated(), '[mn-list-row-meta]')).not.toContain('Audio');
  });

  it('distinguishes opened and unread stories without claiming completion', () => {
    expect(textOf(imported(), '.mn-status-pill')).toBe('Unread');
    expect(textOf(imported({ lastOpenedAt: NOW }), '.mn-status-pill')).toBe('Read');
  });

  it('keeps the whole row a native link and the actions out of it', () => {
    const element = render(generated());
    const link = element.querySelector<HTMLAnchorElement>('a[data-testid="reading-row"]');
    const menuButton = element.querySelector<HTMLButtonElement>('.menu-anchor .mn-icon-button');

    expect(link?.getAttribute('href')).toContain('/reader/');
    expect(menuButton).not.toBeNull();
    expect(menuButton?.closest('a')).toBeNull();
  });

  it('shows the story origin in the leading icon badge', () => {
    const generatedRow = render(generated());
    const importedRow = render(imported());

    expect(generatedRow.querySelector('.story-mark')).toBeNull();
    expect(generatedRow.querySelector('[mn-list-row-leading] mn-icon')).not.toBeNull();
    expect(generatedRow.querySelector('[mn-list-row-meta]')?.textContent).toContain('Generated');
    expect(importedRow.querySelector('[mn-list-row-meta]')?.textContent).toContain('Imported');
  });
});
