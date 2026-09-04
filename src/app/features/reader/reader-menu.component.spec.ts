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
};

describe('Story options', () => {
  beforeEach(() => {
    configureVocabularyTestBed();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });
  function render(row = ROW) {
    const fixture = TestBed.createComponent(ReaderMenuComponent);
    fixture.componentRef.setInput('rows', [row]);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const hide = vi.fn();
    Object.defineProperty(element.querySelector('.panel'), 'hidePopover', { value: hide });
    const press = (label: string) =>
      [...element.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent.trim() === label)
        ?.click();
    return { fixture, element, hide, press };
  }
  it('groups appearance and content behind a single dialog button without a cost note', () => {
    const { element } = render();
    expect(element.querySelector('.anchor-button')?.getAttribute('aria-label')).toBe(
      'Story options',
    );
    expect(element.querySelector('.panel')?.getAttribute('role')).toBe('dialog');
    expect(element.textContent).toContain('Reading appearance');
    expect(element.textContent).toContain('Content for this story');
    expect(element.textContent).not.toMatch(/cost|charges|OpenRouter/);
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
    expect(element.querySelector<HTMLButtonElement>('.row-main button')?.disabled).toBe(true);
    expect(element.textContent).toContain('Stopping…');
  });
  it('closes before requesting confirmation of deletion', () => {
    const { fixture, hide, press } = render();
    const deleted = vi.fn();
    fixture.componentInstance.deleteRequested.subscribe(deleted);
    press('Delete story…');
    expect(hide).toHaveBeenCalledOnce();
    expect(deleted).toHaveBeenCalledOnce();
  });
  it('shows a ready status without a creation action', () => {
    const { element } = render({
      ...ROW,
      action: null,
      label: 'Ready',
      status: '4 of 4 sentences saved',
    });
    expect(element.querySelector('.row-main button')).toBeNull();
    expect(element.textContent).toContain('Ready');
  });
  it('closes before opening the audio player', () => {
    const { fixture, hide, press } = render({
      ...ROW,
      layer: 'audio',
      action: 'listen',
      label: 'Listen',
    });
    const listen = vi.fn();
    fixture.componentInstance.listen.subscribe(listen);
    press('Listen');
    expect(hide).toHaveBeenCalledOnce();
    expect(listen).toHaveBeenCalledOnce();
  });

  it('moves focus into the panel and returns it on Escape', () => {
    const { fixture, element, hide } = render();
    const panel = element.querySelector<HTMLElement>('.panel')!;
    const shown = vi.fn();
    Object.defineProperty(panel, 'showPopover', { value: shown });
    const matches = vi.spyOn(panel, 'matches').mockReturnValue(true);
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
    expect(document.activeElement).toBe(element.querySelector('.anchor-button'));
    matches.mockReturnValue(false);
    panel.dispatchEvent(new Event('toggle'));
    fixture.detectChanges();
    expect(element.querySelector('.anchor-button')?.getAttribute('aria-expanded')).toBe('false');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(hide).toHaveBeenCalledOnce();
  });

  it('keeps audio maintenance behind its disclosure and closes before confirmation', () => {
    const { fixture, element, hide, press } = render({ ...ROW, layer: 'audio' });
    expect(element.querySelector('details')).toBeNull();
    fixture.componentRef.setInput('hasAudio', true);
    fixture.detectChanges();
    expect(element.querySelector('details')?.open).toBe(false);
    const deleted = vi.fn();
    fixture.componentInstance.deleteAudioRequested.subscribe(deleted);
    press('Delete audio…');
    expect(hide).toHaveBeenCalledOnce();
    expect(deleted).toHaveBeenCalledOnce();
  });

  it('shows saving errors and links unavailable preparation to settings', () => {
    const { fixture, element } = render({
      ...ROW,
      action: 'settings',
      label: 'Model settings',
      error: 'Test your model.',
    });
    fixture.componentRef.setInput('error', 'Could not save the stop request.');
    fixture.detectChanges();
    expect(element.querySelector('.row-main a')?.getAttribute('href')).toBe('/settings');
    expect([...element.querySelectorAll('[role="alert"]')].map((node) => node.textContent)).toEqual(
      ['Test your model.', 'Could not save the stop request.'],
    );
  });
});
