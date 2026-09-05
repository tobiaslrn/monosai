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
import {
  ANKI_PROVIDER_FACTORY,
  PACKAGE_PROVIDER_FACTORY,
} from '../../application/shared/anki-tokens';
import { SourceMappingStore } from '../../application/vocabulary/source-mapping.store';
import { vocabularySourceId } from '../../domain/shared/ids';
import type { SourceMapping } from '../../domain/vocabulary/source-mapping';
import type { TextListVocabularySource } from '../../domain/vocabulary/vocabulary-source';
import { SourcePageComponent } from './source-page.component';

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
 * One page per source, read the way a learner reads it.
 *
 * The order is the design: what counts, then how fresh, then what is read, then
 * what is lost. Several of these tests exist because the row this page replaced
 * lied — a checkbox named "Enabled" sat beside an "Auto-sync" badge, so turning
 * off what looked like background syncing emptied the whole vocabulary instead.
 */
describe('SourcePageComponent', () => {
  let beds: VocabularyTestBed;
  let anki: SourceMapping;

  beforeEach(async () => {
    beds = configureVocabularyTestBed();
    TestBed.overrideProvider(ANKI_PROVIDER_FACTORY, {
      useValue: () => new FakeAnkiProvider(CONTRACT_COLLECTION, { kind: 'desktop-connect' }),
    });
    TestBed.overrideProvider(PACKAGE_PROVIDER_FACTORY, {
      useValue: () => new FakeAnkiProvider(CONTRACT_COLLECTION, { kind: 'package' }),
    });
    beds.mappings.stored.set(TEXT_LIST.id, TEXT_LIST);
    anki = mappingFor({ kind: 'anki-connect', providerKind: 'desktop-connect' });
    beds.mappings.stored.set(anki.id, anki);
    await TestBed.inject(SourceMappingStore).load();
  });

  afterEach(() => {
    TestBed.inject(Dialog).closeAll();
  });

  async function settle(fixture: ComponentFixture<SourcePageComponent>): Promise<void> {
    for (let pass = 0; pass < 4; pass += 1) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }

  async function render(id: string): Promise<{
    readonly fixture: ComponentFixture<SourcePageComponent>;
    readonly element: HTMLElement;
  }> {
    const fixture = TestBed.createComponent(SourcePageComponent);
    fixture.componentRef.setInput('sourceId', id);
    await settle(fixture);
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  function required(element: HTMLElement, selector: string): HTMLElement {
    const found = element.querySelector<HTMLElement>(selector);
    if (found === null) {
      throw new Error(`the page has no ${selector}`);
    }
    return found;
  }

  /** The switch behind one test id, as the input it is. */
  function switchAt(element: HTMLElement, testId: string): HTMLInputElement {
    return required(element, `[data-testid="${testId}"]`) as HTMLInputElement;
  }

  function labelOf(input: HTMLInputElement): string {
    return input.closest('label')?.textContent.trim() ?? '';
  }

  it('names the source it is about and how to get back to the list', async () => {
    const { element } = await render(TEXT_LIST.id);

    expect(element.querySelector('h1')?.textContent.trim()).toBe('My textbook');
    expect(element.querySelector('.head a, .head button')?.getAttribute('aria-label')).toBe(
      'Back to words',
    );
  });

  /**
   * The first control decides whether the words count, and it says so. Naming a
   * switch after a stored flag is how one ends up contradicting the box.
   */
  it('leads with whether the words count, named after what it does', async () => {
    const { element } = await render(TEXT_LIST.id);
    const include = switchAt(element, 'include-source');

    expect(include.getAttribute('role')).toBe('switch');
    expect(labelOf(include)).toContain('Count these words');
    expect(include.checked).toBe(true);
  });

  it('keeps freshness apart from counting, and only where it can be answered', async () => {
    const live = await render(anki.id);
    const automatic = switchAt(live.element, 'automatic-sync');
    expect(labelOf(automatic)).toContain('Keep it up to date');
    expect(live.element.querySelector('[data-testid="sync-now"]')).not.toBeNull();

    // A pasted list has nothing to fetch again, so it shows no disabled version
    // of the control — it says what it does instead.
    const list = await render(TEXT_LIST.id);
    expect(list.element.querySelector('[data-testid="automatic-sync"]')).toBeNull();
    expect(list.element.querySelector('[data-testid="sync-now"]')).toBeNull();
    expect(list.element.textContent).toContain('Your own words');
  });

  /** The whole point of separating them: this one may not touch the vocabulary. */
  it('leaves the vocabulary alone when automatic reading is turned off', async () => {
    const { element, fixture } = await render(anki.id);
    const automatic = switchAt(element, 'automatic-sync');

    automatic.checked = false;
    automatic.dispatchEvent(new Event('change'));
    await settle(fixture);

    const store = TestBed.inject(SourceMappingStore);
    expect(store.included()).toHaveLength(2);
    expect(switchAt(element, 'include-source').checked).toBe(true);
  });

  /** A closed fold that hides the answer to its own label is worse than no fold. */
  it('states what the source reads in the summary of the closed disclosure', async () => {
    const { element } = await render(anki.id);
    const details = required(element, 'details.mn-disclosure') as HTMLDetailsElement;

    expect(details.open).toBe(false);
    expect(details.querySelector('summary')?.textContent).toContain(
      `Reading the ${anki.expressionFieldName} field of ${anki.noteTypeName}`,
    );
  });

  it('asks before removing a source, and keeps it when the answer is no', async () => {
    const { element, fixture } = await render(TEXT_LIST.id);

    required(element, '[data-testid="remove-source"]').click();
    await settle(fixture);

    const dialog = document.querySelector('[role="alertdialog"]');
    expect(dialog?.textContent).toContain('Remove My textbook?');
    expect(dialog?.textContent).toContain('cannot be undone');
    // The reversible alternative, named the way this page names it.
    expect(dialog?.textContent).toContain('Count these words');
    expect(document.activeElement?.textContent).toContain('Keep it');

    clickDialogButton('Keep it');
    await settle(fixture);

    expect(TestBed.inject(SourceMappingStore).sources()).toHaveLength(2);
  });

  it('removes the source only after the destructive answer', async () => {
    const { element, fixture } = await render(TEXT_LIST.id);

    required(element, '[data-testid="remove-source"]').click();
    await settle(fixture);
    clickDialogButton('Remove permanently');
    await settle(fixture);

    expect(TestBed.inject(SourceMappingStore).sources()).toHaveLength(1);
  });

  it('says so plainly when the source is gone rather than showing empty controls', async () => {
    const { element } = await render('44444444-4444-4444-8444-444444444444');

    expect(element.textContent).toContain('no longer here');
    expect(element.querySelector('[data-testid="include-source"]')).toBeNull();
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
