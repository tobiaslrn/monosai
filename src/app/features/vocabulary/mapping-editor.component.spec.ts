import { Dialog } from '@angular/cdk/dialog';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CONTRACT_COLLECTION } from '../../../testing/anki-collection';
import { FakeAnkiProvider } from '../../../testing/anki-fakes';
import { mappingFor } from '../../../testing/anki-provider-contract';
import {
  configureVocabularyTestBed,
  type VocabularyTestBed,
} from '../../../testing/vocabulary-fakes';
import { ANKI_PROVIDER_FACTORY } from '../../application/shared/anki-tokens';
import { SourceMappingStore } from '../../application/vocabulary/source-mapping.store';
import { VocabularyRefreshStore } from '../../application/vocabulary/vocabulary-refresh.store';
import { vocabularySourceId } from '../../domain/shared/ids';
import type { TextListVocabularySource } from '../../domain/vocabulary/vocabulary-source';
import { MappingEditorComponent } from './mapping-editor.component';

const TEXT_LIST: TextListVocabularySource = {
  id: vocabularySourceId('22222222-2222-4222-8222-222222222222'),
  kind: 'text-list',
  label: 'My textbook',
  content: 'ねこ\n犬',
  enabled: true,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  lastSyncedAt: 1_700_000_000_000,
};

/**
 * The source card, read the way a learner reads it.
 *
 * Two of these tests exist because the row used to lie: a checkbox named
 * "Enabled" sat beside an "Auto-sync" badge, so turning off what looked like
 * background syncing emptied the whole vocabulary instead, and Remove destroyed
 * a source that the same card said a story depended on.
 */
describe('MappingEditorComponent', () => {
  let beds: VocabularyTestBed;

  beforeEach(async () => {
    beds = configureVocabularyTestBed();
    TestBed.overrideProvider(ANKI_PROVIDER_FACTORY, {
      useValue: () => new FakeAnkiProvider(CONTRACT_COLLECTION, { kind: 'desktop-connect' }),
    });
    beds.mappings.stored.set(TEXT_LIST.id, TEXT_LIST);
    const anki = mappingFor({ kind: 'anki-connect', providerKind: 'desktop-connect' });
    beds.mappings.stored.set(anki.id, anki);
    await TestBed.inject(SourceMappingStore).load();
  });

  afterEach(() => {
    TestBed.inject(Dialog).closeAll();
  });

  async function settle(fixture: ComponentFixture<MappingEditorComponent>): Promise<void> {
    for (let pass = 0; pass < 4; pass += 1) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }

  async function render(): Promise<{
    readonly fixture: ComponentFixture<MappingEditorComponent>;
    readonly element: HTMLElement;
  }> {
    const fixture = TestBed.createComponent(MappingEditorComponent);
    await settle(fixture);
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  function cards(element: HTMLElement): readonly HTMLElement[] {
    return [...element.querySelectorAll<HTMLElement>('li.source')];
  }

  function labelOf(input: HTMLInputElement): string {
    return input.closest('label')?.textContent.trim() ?? '';
  }

  function includeBox(card: HTMLElement): HTMLInputElement {
    const input = card.querySelector<HTMLInputElement>('[data-testid="include-source"]');
    if (input === null) {
      throw new Error('the card has no inclusion checkbox');
    }
    return input;
  }

  it('names the inclusion checkbox after what it does, not after a state', async () => {
    const { element } = await render();

    for (const card of cards(element)) {
      expect(labelOf(includeBox(card))).toBe('Include in vocabulary');
    }
  });

  it('shows the stored deck when the catalogue arrives after initial rendering', async () => {
    const store = TestBed.inject(SourceMappingStore);
    const source = store.mappings()[0];
    await store.update(source.id, { deckName: 'Unused' });
    const { element, fixture } = await render();
    await TestBed.inject(VocabularyRefreshStore).connect(
      new FakeAnkiProvider(CONTRACT_COLLECTION, { kind: 'desktop-connect' }),
    );
    await settle(fixture);
    expect(element.querySelector<HTMLSelectElement>('select[aria-label="Deck"]')?.value).toBe(
      'Unused',
    );
  });

  /**
   * A name that reads as a state contradicts the box when the box is clear.
   * This one describes the consequence, so it is true either way round.
   */
  it('keeps the accessible name truthful in both states', async () => {
    const { element, fixture } = await render();
    const box = includeBox(cards(element)[0]);
    expect(box.checked).toBe(true);

    box.checked = false;
    box.dispatchEvent(new Event('change'));
    await settle(fixture);

    const after = includeBox(cards(element)[0]);
    expect(labelOf(after)).toBe('Include in vocabulary');
    expect(after.checked).toBe(false);
  });

  it('keeps automatic syncing in its own group, apart from inclusion', async () => {
    const { element } = await render();
    const anki = cards(element).find((card) => card.textContent.includes('Anki'));

    const automatic = anki?.querySelector<HTMLInputElement>('[data-testid="automatic-sync"]');
    expect(automatic).not.toBeNull();
    expect(labelOf(automatic!)).toBe('Sync automatically');
    expect(automatic?.closest('.sync')).not.toBeNull();
    expect(includeBox(anki!).closest('.sync')).toBeNull();
    expect(element.textContent).not.toContain('Auto-sync');
  });

  /** The whole point of separating them: this one may not touch the vocabulary. */
  it('leaves the vocabulary alone when automatic syncing is turned off', async () => {
    const { element, fixture } = await render();
    const anki = cards(element).find((card) => card.textContent.includes('Anki'))!;
    const automatic = anki.querySelector<HTMLInputElement>('[data-testid="automatic-sync"]')!;

    automatic.checked = false;
    automatic.dispatchEvent(new Event('change'));
    await settle(fixture);

    const store = TestBed.inject(SourceMappingStore);
    expect(store.included()).toHaveLength(2);
    expect(includeBox(anki).checked).toBe(true);
  });

  it('offers Sync now only where there is a live source to read again', async () => {
    const { element } = await render();

    const withSync = cards(element).filter(
      (card) => card.querySelector('[data-testid="sync-now"]') !== null,
    );
    expect(withSync).toHaveLength(1);
    expect(withSync[0].textContent).toContain('Anki');
  });

  it('asks before removing a source, and keeps it when the answer is no', async () => {
    const { element, fixture } = await render();

    cards(element)[0].querySelector<HTMLButtonElement>('[data-testid="remove-source"]')?.click();
    await settle(fixture);

    const dialog = document.querySelector('[role="alertdialog"]');
    expect(dialog?.textContent).toContain('Remove My textbook?');
    expect(dialog?.textContent).toContain('cannot be undone');
    expect(document.activeElement?.textContent).toContain('Keep it');

    clickDialogButton('Keep it');
    await settle(fixture);

    expect(cards(element)).toHaveLength(2);
    expect(TestBed.inject(SourceMappingStore).sources()).toHaveLength(2);
  });

  it('removes the source only after the destructive answer', async () => {
    const { element, fixture } = await render();

    cards(element)[0].querySelector<HTMLButtonElement>('[data-testid="remove-source"]')?.click();
    await settle(fixture);
    clickDialogButton('Remove permanently');
    await settle(fixture);

    expect(TestBed.inject(SourceMappingStore).sources()).toHaveLength(1);
  });

  it('points at the reversible alternative before destroying anything', async () => {
    const { element, fixture } = await render();

    cards(element)[0].querySelector<HTMLButtonElement>('[data-testid="remove-source"]')?.click();
    await settle(fixture);

    expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain(
      'Include in vocabulary',
    );
    clickDialogButton('Keep it');
    await settle(fixture);
  });
});

function clickDialogButton(label: string): void {
  const button = [...document.querySelectorAll<HTMLButtonElement>('mn-confirm-dialog button')].find(
    (candidate) => candidate.textContent.includes(label),
  );
  if (button === undefined) {
    throw new Error(`the dialog has no ${label} button`);
  }
  button.click();
}
