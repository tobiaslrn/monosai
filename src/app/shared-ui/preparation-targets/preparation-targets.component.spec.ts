import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ConfigurationReadiness } from '../../domain/ai/configuration-readiness';
import type { PreparationLayer } from '../../domain/enrichment/preparation';
import { PreparationTargetsComponent } from './preparation-targets.component';

/**
 * The switches say what a reading should eventually contain, so a disabled
 * audio switch has to name the state that prevents it rather than repeat one
 * piece of setup advice that is wrong three times out of four.
 */
describe('PreparationTargetsComponent', () => {
  let fixture: ComponentFixture<PreparationTargetsComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PreparationTargetsComponent] });
    fixture = TestBed.createComponent(PreparationTargetsComponent);
  });

  function render(
    targets: readonly PreparationLayer[],
    audioReadiness: ConfigurationReadiness = 'ready',
  ): HTMLElement {
    fixture.componentRef.setInput('targets', targets);
    fixture.componentRef.setInput('audioReadiness', audioReadiness);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function switchFor(page: HTMLElement, layer: PreparationLayer): HTMLInputElement {
    const control = page.querySelector<HTMLInputElement>(`[data-testid="preparation-${layer}"]`);
    expect(control).not.toBeNull();
    return control!;
  }

  it('reflects the declared targets and names each layer', () => {
    const page = render(['english', 'audio']);

    expect(switchFor(page, 'english').checked).toBe(true);
    expect(switchFor(page, 'grammar').checked).toBe(false);
    expect(switchFor(page, 'audio').checked).toBe(true);
    expect(page.textContent).toContain('English');
    expect(page.textContent).toContain('Grammar notes');
    expect(page.textContent).toContain('Audio');
  });

  it('emits the whole set in a stable order when one switch changes', () => {
    const page = render(['audio']);
    const emitted: (readonly PreparationLayer[])[] = [];
    fixture.componentInstance.targetsChanged.subscribe((targets) => {
      emitted.push(targets);
    });

    const english = switchFor(page, 'english');
    english.checked = true;
    english.dispatchEvent(new Event('change'));

    expect(emitted).toEqual([['english', 'audio']]);
  });

  it('drops a layer that is switched off', () => {
    const page = render(['english', 'grammar']);
    const emitted: (readonly PreparationLayer[])[] = [];
    fixture.componentInstance.targetsChanged.subscribe((targets) => {
      emitted.push(targets);
    });

    const grammar = switchFor(page, 'grammar');
    grammar.checked = false;
    grammar.dispatchEvent(new Event('change'));

    expect(emitted).toEqual([['english']]);
  });

  it.each([
    ['not-configured' as const, 'Set up a voice to prepare audio.'],
    ['untested' as const, 'Test your voice setup to prepare audio.'],
    ['stale' as const, 'Retest your changed voice setup to prepare audio.'],
    ['failed' as const, 'Fix and test your voice setup to prepare audio.'],
  ])('names the %s voice configuration as the reason audio is unavailable', (readiness, reason) => {
    const page = render(['english'], readiness);
    const audio = switchFor(page, 'audio');

    expect(audio.disabled).toBe(true);
    expect(page.textContent).toContain(reason);
    const describedBy = audio.getAttribute('aria-describedby');
    expect(describedBy).not.toBeNull();
    expect(page.querySelector(`#${describedBy}`)?.textContent).toContain(reason);
  });

  it('leaves audio selectable and unexplained once a voice is ready', () => {
    const page = render(['english'], 'ready');

    expect(switchFor(page, 'audio').disabled).toBe(false);
    expect(page.querySelector('.reason')).toBeNull();
  });

  it('gives each mounted group its own description id', () => {
    const first = render(['english'], 'not-configured');
    const other = TestBed.createComponent(PreparationTargetsComponent);
    other.componentRef.setInput('targets', ['english']);
    other.componentRef.setInput('audioReadiness', 'not-configured');
    other.detectChanges();

    const firstId = switchFor(first, 'audio').getAttribute('aria-describedby');
    const otherId = switchFor(other.nativeElement as HTMLElement, 'audio').getAttribute(
      'aria-describedby',
    );

    expect(firstId).not.toBeNull();
    expect(otherId).not.toBe(firstId);
  });
});
