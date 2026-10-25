import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { SnapshotHistoryStore } from '../../application/vocabulary/snapshot-history.store';
import { SourceMappingStore } from '../../application/vocabulary/source-mapping.store';
import { VocabularySyncService } from '../../application/vocabulary/vocabulary-sync.service';
import { vocabularySourceId } from '../../domain/shared/ids';
import type { TextListVocabularySource } from '../../domain/vocabulary/vocabulary-source';
import { TextListSourceComponent } from './text-list-source.component';

function textList(id: string, label: string, content: string): TextListVocabularySource {
  return {
    id: vocabularySourceId(id),
    kind: 'text-list',
    label,
    content,
    enabled: true,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    lastSyncedAt: null,
  };
}

const FIRST = textList('22222222-2222-4222-8222-222222222222', 'My textbook', 'ねこ\n犬');
const SECOND = textList('33333333-3333-4333-8333-333333333333', 'Genki', '食べる');

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TextListSourceComponent],
  template: `<mn-text-list-source [source]="source()" />`,
})
class HostComponent {
  readonly source = signal<TextListVocabularySource | null>(FIRST);
}

describe('TextListSourceComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        // Saving always fails, which is the one way to put an error on the editor.
        { provide: SourceMappingStore, useValue: { updateTextList: () => Promise.resolve(null) } },
        { provide: VocabularySyncService, useValue: {} },
        { provide: SnapshotHistoryStore, useValue: {} },
      ],
    });
  });

  function render() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const name = element.querySelector<HTMLInputElement>('input[type="text"]');
    const words = element.querySelector<HTMLTextAreaElement>('textarea');
    if (name === null || words === null) {
      throw new Error('the editor rendered no fields');
    }
    return { fixture, element, name, words };
  }

  function type(field: HTMLInputElement | HTMLTextAreaElement, value: string): void {
    field.value = value;
    field.dispatchEvent(new Event('input'));
  }

  it('opens with the source it was given', () => {
    const { name, words } = render();

    expect(name.value).toBe('My textbook');
    expect(words.value).toBe('ねこ\n犬');
  });

  it('keeps typed edits while the source reference is unchanged', () => {
    const { fixture, name, words } = render();

    type(name, 'Edited');
    type(words, '猫');
    fixture.componentInstance.source.set(FIRST);
    fixture.detectChanges();

    expect(name.value).toBe('Edited');
    expect(words.value).toBe('猫');
  });

  it('starts over from a different source, discarding edits and the last error', async () => {
    const { fixture, element, name, words } = render();
    type(name, 'Edited');
    fixture.detectChanges();
    element.querySelector('form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('could not be saved');

    fixture.componentInstance.source.set(SECOND);
    fixture.detectChanges();

    expect(name.value).toBe('Genki');
    expect(words.value).toBe('食べる');
    expect(element.querySelector('[role="alert"]')).toBeNull();
  });

  it('empties the editor when the source is cleared', () => {
    const { fixture, name, words } = render();

    fixture.componentInstance.source.set(null);
    fixture.detectChanges();

    expect(name.value).toBe('');
    expect(words.value).toBe('');
  });
});
