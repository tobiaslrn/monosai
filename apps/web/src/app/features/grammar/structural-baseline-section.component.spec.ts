import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { LanguageStore } from '../../application/language/language.store';
import { StructuralBaselineSectionComponent } from './structural-baseline-section.component';

const PARTICLE = {
  id: 'particle-ga',
  category: 'particle',
  forms: ['が'],
  partsOfSpeech: [],
  nameEn: 'が (subject marker)',
  descriptionEn: 'Marks the subject of the sentence.',
} as const;

describe('StructuralBaselineSectionComponent', () => {
  it('tags the Japanese part of a name as Japanese and leaves its English gloss in English', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: LanguageStore, useValue: { structuralBaseline: signal([PARTICLE]) } }],
    });
    const fixture = TestBed.createComponent(StructuralBaselineSectionComponent);
    fixture.detectChanges();
    const name = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.name');

    expect(name?.textContent).toBe('が (subject marker)');
    expect(name?.querySelector('[lang="ja"]')?.textContent).toBe('が');
    expect(name?.textContent.replace('が', '')).not.toMatch(/[぀-ヿ㐀-鿿]/);
  });
});
