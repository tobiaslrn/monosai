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
      '.mn-actions button.mn-button--primary',
    )!;
    expect(button.hasAttribute('aria-busy')).toBe(false);

    button.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.disabled).toBe(false);

    imports.release();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(button.hasAttribute('aria-busy')).toBe(false);
    });
  });
});
