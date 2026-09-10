import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  configureReadingLevelTestBed,
  type ReadingLevelTestBed,
} from '../../../testing/reading-level-fakes';
import { TEST_PRESETS } from '../../../testing/grammar-fakes';
import { GrammarProfileStore } from '../../application/grammar/grammar-profile.store';
import { NavigationHistoryService } from '../../core/routing/navigation-history.service';
import { LevelChoicePageComponent } from './level-choice-page.component';

describe('LevelChoicePageComponent', () => {
  let beds: ReadingLevelTestBed;
  let backOrNavigate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    beds = configureReadingLevelTestBed();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    backOrNavigate = vi.fn(() => Promise.resolve());
    TestBed.overrideProvider(NavigationHistoryService, {
      useValue: { backOrNavigate, canPopTo: () => false, currentOrigin: () => null },
    });
  });

  async function settle(fixture: ComponentFixture<LevelChoicePageComponent>): Promise<void> {
    for (let pass = 0; pass < 3; pass += 1) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }

  async function render(): Promise<{
    readonly fixture: ComponentFixture<LevelChoicePageComponent>;
    readonly element: HTMLElement;
  }> {
    const fixture = TestBed.createComponent(LevelChoicePageComponent);
    await settle(fixture);
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  function radios(element: HTMLElement): HTMLInputElement[] {
    return [...element.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
  }

  function save(element: HTMLElement): void {
    element.querySelector<HTMLButtonElement>('[data-testid="save-level"]')?.click();
  }

  it('starts from the saved level', async () => {
    const { element } = await render();

    expect(element.querySelector('h1')?.textContent.trim()).toBe('Reading level');
    expect(radios(element).map((radio) => radio.checked)).toEqual([true, false]);
  });

  /** Changing the level makes every analysis stale, so reading an example must not. */
  it('keeps a choice as a draft until Save level commits it', async () => {
    const { fixture, element } = await render();
    const store = TestBed.inject(GrammarProfileStore);

    radios(element)[1].click();
    await settle(fixture);

    expect(store.selection().presetId).toBe('mn-preset-starter');
    expect(element.querySelector('.example')?.textContent.trim()).toBe(TEST_PRESETS[1].exampleJa);
    expect(backOrNavigate).not.toHaveBeenCalled();

    save(element);

    await vi.waitFor(() => {
      expect(backOrNavigate).toHaveBeenCalledWith('/reading-level');
    });
    expect(store.selection().presetId).toBe('mn-preset-basic');
  });

  it('returns without writing when the level did not change', async () => {
    const { element } = await render();
    const selectPreset = vi.spyOn(TestBed.inject(GrammarProfileStore), 'selectPreset');

    save(element);

    await vi.waitFor(() => {
      expect(backOrNavigate).toHaveBeenCalledWith('/reading-level');
    });
    expect(selectPreset).not.toHaveBeenCalled();
  });

  it('keeps the language failure surface and offers no ladder', async () => {
    const { fixture, element } = await render();
    beds.languageStatus.set('failed');
    await settle(fixture);

    const failed = element.querySelector('.assets-failed');
    expect(failed?.getAttribute('role')).toBe('alert');
    expect(failed?.textContent).toContain('level is unchanged');
    expect(element.querySelector('mn-preset-picker')).toBeNull();
    expect(element.querySelector('[data-testid="save-level"]')).toBeNull();
  });
});
