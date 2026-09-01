import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Reading } from '../../domain/reading/reading';
import { readingId } from '../../domain/shared/ids';
import { formatDateTime } from '../../domain/shared/locale';
import { ReadingCardComponent } from './reading-card.component';

function reading(characterCount: number): Reading {
  return {
    id: readingId('3f6d2c1a-9b4e-4a7d-8f21-0c5e7a9b1d33'),
    kind: 'imported',
    importSource: 'paste',
    sourceTextHash: 'h',
    title: '吾輩は猫である',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    lastOpenedAt: null,
    sentenceCount: 4,
    characterCount,
    excerpt: '猫が好きです。',
    translationSummary: { total: 4, completed: 0, failed: 0 },
    grammarSummary: { state: 'not-requested' },
    audioSummary: { total: 4, completed: 0, failed: 0 },
    analyzerVersion: '1',
  };
}

function metaOf(characterCount: number): string {
  const fixture = TestBed.createComponent(ReadingCardComponent);
  fixture.componentRef.setInput('reading', reading(characterCount));
  fixture.detectChanges();
  return (fixture.nativeElement as HTMLElement).querySelector('.meta')?.textContent ?? '';
}

/**
 * The card showed `3118 characters` while Add text, two screens earlier,
 * showed `50,000 characters` for the same kind of number. One application, one
 * format.
 */
describe('ReadingCardComponent character count', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('groups a long reading the way the import counter does', () => {
    expect(metaOf(3118)).toContain('3,118 characters');
  });

  it('keeps the singular for a one-character reading', () => {
    expect(metaOf(1)).toContain('1 character');
  });

  it('needs no separator below a thousand', () => {
    expect(metaOf(940)).toContain('940 characters');
  });

  it('shows creation time so otherwise identical rows can be distinguished', () => {
    expect(metaOf(940)).toContain(formatDateTime(1_700_000_000_000));
  });
});
