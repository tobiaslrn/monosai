import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReaderMenuComponent } from './reader-menu.component';
import { configureVocabularyTestBed } from '../../../testing/vocabulary-fakes';
import type { ReaderContentState } from './reader-content-state';

const ROW: ReaderContentState = {
  layer: 'english',
  name: 'English translation',
  status: 'Not added',
  action: 'prepare',
  label: 'Translate story',
  busy: false,
  disabled: false,
  error: null,
  setup: false,
  settingsLink: '/settings/text-models',
};

/** A layer waiting on the same missing key as the others. */
function waitingOnKey(layer: ReaderContentState['layer']): ReaderContentState {
  return {
    ...ROW,
    layer,
    name: layer,
    status: 'Add an OpenRouter key.',
    action: layer === 'audio' ? null : 'settings',
    label: layer === 'audio' ? '' : 'Open Settings',
    setup: true,
    settingsLink: '/settings',
  };
}

describe('Story options', () => {
  beforeEach(() => {
    configureVocabularyTestBed();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });
  function render(row: ReaderContentState | readonly ReaderContentState[] = ROW) {
    const fixture = TestBed.createComponent(ReaderMenuComponent);
    fixture.componentRef.setInput('rows', Array.isArray(row) ? row : [row]);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const hide = vi.fn();
    Object.defineProperty(element.querySelector('mn-sheet-popover'), 'hidePopover', {
      value: hide,
    });
    // By accessible name: a row's one button is named by the row's own label.
    const nameOf = (button: Element): string => {
      const label = button.getAttribute('aria-label');
      if (label !== null) return label;
      const id = button.getAttribute('aria-labelledby');
      return id === null
        ? button.textContent.trim()
        : (document.getElementById(id)?.textContent.trim() ?? '');
    };
    const press = (label: string) =>
      [...element.querySelectorAll<HTMLElement>('button, a.mn-settings-press')]
        .find((button) => nameOf(button) === label)
        ?.click();
    return { fixture, element, hide, press };
  }
  it('groups appearance and content under plain headings behind one dialog button without a cost note', () => {
    const { element } = render();
    expect(
      element.querySelector('button[aria-haspopup="dialog"]')?.getAttribute('aria-label'),
    ).toBe('Story options');
    expect(element.querySelector('mn-sheet-popover')?.getAttribute('role')).toBe('dialog');
    expect(element.textContent).toContain('Reading appearance');
    expect(element.textContent).toContain('Content for this story');
    expect(element.textContent).not.toMatch(/cost|charges|OpenRouter/);
  });
  it('says a setup step every layer shares once, with one way to Settings', () => {
    const { element } = render([
      waitingOnKey('english'),
      waitingOnKey('grammar'),
      waitingOnKey('audio'),
    ]);

    const notice = element.querySelector('[data-testid="shared-setup"]');
    expect(notice?.textContent).toContain('Add an OpenRouter key.');
    expect(notice?.querySelector('a')?.getAttribute('href')).toBe('/settings');
    expect(element.querySelectorAll('a[href="/settings"]')).toHaveLength(1);
    // The rows say the state in their own line, with no pill beside it.
    expect(element.querySelector('.mn-status-pill')).toBeNull();
    expect(
      [...element.querySelectorAll('[data-layer] .mn-settings-row__details')].map((line) =>
        line.textContent.trim(),
      ),
    ).toEqual(['Not set up', 'Not set up', 'Not set up']);
  });

  it('keeps a lone setup step on its own row', () => {
    const { element } = render(waitingOnKey('english'));

    expect(element.querySelector('[data-testid="shared-setup"]')).toBeNull();
    expect(element.querySelector('[data-layer] .mn-settings-row__details')?.textContent).toContain(
      'Add an OpenRouter key.',
    );
  });

  it('starts a layer without closing its progress surface', () => {
    const { fixture, hide, press } = render();
    const prepare = vi.fn();
    fixture.componentInstance.prepare.subscribe(prepare);
    press('Translate story');
    expect(prepare).toHaveBeenCalledWith('english');
    expect(hide).not.toHaveBeenCalled();
  });
  it('stops only the chosen layer and shows pending cancellation', () => {
    const { fixture, element, press } = render({
      ...ROW,
      action: 'cancel',
      label: 'Stop',
      busy: true,
    });
    const cancel = vi.fn();
    fixture.componentInstance.stopRequested.subscribe(cancel);
    press('Stop');
    expect(cancel).toHaveBeenCalledWith('english');
    fixture.componentRef.setInput('pending', 'english');
    fixture.detectChanges();
    // Busy keeps the row, its label and its size, and a second press does nothing.
    const stop = element.querySelector<HTMLButtonElement>('[data-layer] button')!;
    expect(stop.getAttribute('aria-busy')).toBe('true');
    expect(stop.disabled).toBe(false);
    stop.click();
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('leaves deleting the story to the library', () => {
    const { element } = render();
    expect(element.textContent).not.toContain('Delete story');
  });
  it('shows a completed status without a separate ready field', () => {
    const { element } = render({
      ...ROW,
      action: null,
      label: '',
      status: 'Ready',
    });
    expect(element.querySelector('[data-layer] button, [data-layer] a')).toBeNull();
    expect(element.textContent).toContain('Ready');
  });

  it('moves focus into the panel and returns it on Escape', () => {
    const { fixture, element, hide } = render();
    const panel = element.querySelector<HTMLElement>('mn-sheet-popover')!;
    const shown = vi.fn();
    Object.defineProperty(panel, 'showPopover', { value: shown });
    const matches = vi.spyOn(panel, 'matches').mockReturnValue(true);
    // jsdom does not render a `[popover]` it has not opened, and focus needs a rendered element.
    panel.style.display = 'block';
    const opened = vi.fn();
    fixture.componentInstance.opened.subscribe(opened);
    fixture.componentInstance.open();
    expect(shown).toHaveBeenCalledOnce();
    panel.dispatchEvent(new Event('toggle'));
    fixture.detectChanges();
    expect(opened).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(
      element.querySelector('[aria-label="Close story options"]'),
    );
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(hide).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(element.querySelector('button[aria-haspopup="dialog"]'));
    matches.mockReturnValue(false);
    panel.dispatchEvent(new Event('toggle'));
    fixture.detectChanges();
    expect(
      element.querySelector('button[aria-haspopup="dialog"]')?.getAttribute('aria-expanded'),
    ).toBe('false');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(hide).toHaveBeenCalledOnce();
  });

  it('shows audio deletion inline and closes before confirmation', () => {
    const { fixture, element, hide, press } = render({ ...ROW, layer: 'audio' });
    expect(element.querySelector('details')).toBeNull();
    fixture.componentRef.setInput('hasAudio', true);
    fixture.detectChanges();
    expect(element.querySelector('details')).toBeNull();
    const deleted = vi.fn();
    fixture.componentInstance.deleteAudioRequested.subscribe(deleted);
    press('Delete audio…');
    expect(hide).toHaveBeenCalledOnce();
    expect(deleted).toHaveBeenCalledOnce();
  });

  it('gives saved translation and grammar rows the same inline clear lifecycle', () => {
    const { fixture, element, hide, press } = render();
    fixture.componentRef.setInput('savedLayers', ['english']);
    fixture.detectChanges();
    const cleared = vi.fn();
    fixture.componentInstance.clearAidRequested.subscribe(cleared);

    expect(element.querySelector('details')).toBeNull();
    press('Clear translation…');

    expect(hide).toHaveBeenCalledOnce();
    expect(cleared).toHaveBeenCalledWith('english');
  });

  it('shows saving errors and links unavailable preparation to settings', () => {
    const { fixture, element } = render({
      ...ROW,
      action: 'settings',
      label: 'Open Settings',
      error: 'Test your model.',
    });
    fixture.componentRef.setInput('error', 'Could not save the stop request.');
    fixture.detectChanges();
    expect(element.querySelector('[data-layer] a')?.getAttribute('href')).toBe(
      '/settings/text-models',
    );
    expect([...element.querySelectorAll('[role="alert"]')].map((node) => node.textContent)).toEqual(
      ['Test your model.', 'Could not save the stop request.'],
    );
  });

  describe('after the credit link is followed', () => {
    const CREDIT: ReaderContentState = {
      ...ROW,
      layer: 'grammar',
      name: 'Grammar notes',
      status: '0 of 3 sentences analysed · Stopped',
      action: 'credit',
      label: 'OpenRouter credit',
      error: 'Out of credit.',
    };

    function followCredit() {
      const bed = render(CREDIT);
      const followed = vi.fn();
      bed.fixture.componentInstance.creditOpened.subscribe(followed);
      const link = bed.element.querySelector<HTMLAnchorElement>('[data-layer="grammar"] a')!;
      link.addEventListener('click', (event) => {
        event.preventDefault();
      });
      link.focus();
      link.click();
      return { ...bed, followed, link };
    }

    it('reports which layer followed it', () => {
      expect(followCredit().followed).toHaveBeenCalledWith('grammar');
    });

    it("moves focus to the row's new action when the link is replaced", async () => {
      const { fixture, element, link } = followCredit();
      expect(document.activeElement).toBe(link);
      fixture.componentRef.setInput('rows', [{ ...CREDIT, action: 'prepare', label: 'Continue' }]);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(document.activeElement).toBe(
        element.querySelector('[data-layer="grammar"] button.mn-settings-press'),
      );
    });

    it('moves focus to the row when the link goes and nothing replaces it', async () => {
      const { fixture, element } = followCredit();
      fixture.componentRef.setInput('rows', [{ ...CREDIT, action: null, label: '' }]);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(document.activeElement).toBe(element.querySelector('[data-layer="grammar"]'));
    });

    it('leaves focus alone when it had already moved elsewhere', async () => {
      const { fixture, element } = followCredit();
      const elsewhere = element.querySelector<HTMLElement>('button[aria-haspopup="dialog"]')!;
      elsewhere.focus();
      fixture.componentRef.setInput('rows', [{ ...CREDIT, action: 'prepare', label: 'Continue' }]);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(document.activeElement).toBe(elsewhere);
    });
  });
});
