import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportStore } from '../../application/reading/import.store';
import { TextImportService } from '../../application/reading/text-import.service';
import { languageError } from '../../domain/language/language-error';
import { err, ok } from '../../domain/shared/result';
import { AddTextPageComponent } from './add-text-page.component';

/** Holds the language check open so the page can be inspected while it works. */
class HeldImportService {
  release: () => void = () => undefined;

  findDuplicates() {
    return Promise.resolve(ok([]));
  }

  async ensureLanguageReady() {
    await new Promise<void>((resolve) => {
      this.release = resolve;
    });
    return err(languageError('assets-unavailable', 'not ready'));
  }
}

describe('AddTextPageComponent', () => {
  let imports: HeldImportService;

  beforeEach(() => {
    imports = new HeldImportService();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: TextImportService, useValue: imports }],
    });
  });

  it('marks the commit button busy while a story is being added, then clears it', async () => {
    const fixture = TestBed.createComponent(AddTextPageComponent);
    const store = fixture.debugElement.injector.get(ImportStore);
    store.setPastedText('今日は天気がいいです。');
    fixture.detectChanges();
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      'mn-action-bar button.mn-button--primary',
    )!;
    expect(button.hasAttribute('aria-busy')).toBe(false);

    button.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.disabled).toBe(false);
    // The wait names its stage, with no trailing ellipsis.
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[role="status"]')?.textContent.trim(),
    ).toBe('Preparing Japanese analysis');

    imports.release();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(button.hasAttribute('aria-busy')).toBe(false);
    });
  });

  it('names every later stage of a save the same way, with no trailing ellipsis', async () => {
    const stages = new StagedImportService();
    TestBed.overrideProvider(TextImportService, { useValue: stages });
    const fixture = TestBed.createComponent(AddTextPageComponent);
    const store = fixture.debugElement.injector.get(ImportStore);
    store.setPastedText('今日は天気がいいです。');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const status = (): string | undefined =>
      element.querySelector('[role="status"]')?.textContent.trim();

    element.querySelector<HTMLButtonElement>('mn-action-bar button.mn-button--primary')!.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(status()).toBe('Splitting sentences');
    });

    stages.releaseSegment();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(status()).toBe('Saving');
    });

    stages.releaseSave();
    await fixture.whenStable();
  });
});

/** Lets the language check pass and holds segmentation, then the save, open. */
class StagedImportService {
  releaseSegment: () => void = () => undefined;
  releaseSave: () => void = () => undefined;

  findDuplicates() {
    return Promise.resolve(ok([]));
  }

  ensureLanguageReady() {
    return Promise.resolve(ok(undefined));
  }

  async segment() {
    await new Promise<void>((resolve) => {
      this.releaseSegment = resolve;
    });
    // Every sentence already analysed, so the save follows at once.
    return ok({ paragraphs: [] });
  }

  async save() {
    await new Promise<void>((resolve) => {
      this.releaseSave = resolve;
    });
    return err(languageError('assets-unavailable', 'not saved'));
  }
}
