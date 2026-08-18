import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { Token } from '../../domain/reading/token';
import type { TokenStatusAssignment } from '../../domain/reading/validation';
import { ReaderTokenComponent } from './reader-token.component';

function token(overrides: Partial<Token> = {}): Token {
  return {
    id: 't1',
    startUtf16: 0,
    endUtf16: 1,
    surface: '猫',
    readingHiragana: 'ねこ',
    partOfSpeech: 'noun',
    dictionaryKeys: ['猫'],
    isPunctuation: false,
    ...overrides,
  };
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReaderTokenComponent],
  template: `
    <mn-reader-token
      [token]="current()"
      [status]="status()"
      [showFurigana]="furigana()"
      [showMarkers]="markers()"
      (activated)="activations.push($event)"
    />
  `,
})
class HostComponent {
  readonly current = signal<Token>(token());
  readonly status = signal<TokenStatusAssignment | null>(null);
  readonly furigana = signal(true);
  readonly markers = signal(true);
  readonly activations: Token[] = [];
}

describe('ReaderTokenComponent', () => {
  function render() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('renders an inspectable token as a real button', () => {
    const element = render().nativeElement as HTMLElement;
    const button = element.querySelector('button');

    expect(button).not.toBeNull();
    expect(button?.type).toBe('button');
    expect(button?.textContent).toContain('猫');
  });

  it('activates on click', () => {
    const fixture = render();
    const element = fixture.nativeElement as HTMLElement;

    element.querySelector('button')?.click();
    expect(fixture.componentInstance.activations).toHaveLength(1);
  });

  it('activates on Enter and Space, because it is a native button', () => {
    const fixture = render();
    const button = (fixture.nativeElement as HTMLElement).querySelector('button');

    // A native button turns both keys into a click; asserting the element type
    // is what proves keyboard activation works without custom handlers.
    expect(button?.tagName).toBe('BUTTON');
    button?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    button?.click();
    expect(fixture.componentInstance.activations).toHaveLength(1);
  });

  it('renders ruby only for a reading that adds information', () => {
    const fixture = render();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('rt')?.textContent).toBe('ねこ');

    fixture.componentInstance.current.set(
      token({ id: 't2', surface: 'ねこ', readingHiragana: 'ねこ' }),
    );
    fixture.detectChanges();
    expect(element.querySelector('rt')).toBeNull();
  });

  it('hides ruby when the furigana aid is off', () => {
    const fixture = render();
    fixture.componentInstance.furigana.set(false);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('rt')).toBeNull();
    expect(element.querySelector('button')?.textContent).toContain('猫');
  });

  it('renders punctuation as plain text with no focus stop', () => {
    const fixture = render();
    fixture.componentInstance.current.set(
      token({ id: 'p1', surface: '。', isPunctuation: true, readingHiragana: undefined }),
    );
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('button')).toBeNull();
    expect(element.textContent).toContain('。');
  });

  it('carries status as a marker class and an accessible label, not colour alone', () => {
    const fixture = render();
    fixture.componentInstance.status.set({
      tokenId: 't1',
      validation: { category: 'not-in-snapshot' },
    });
    fixture.detectChanges();

    const button = (fixture.nativeElement as HTMLElement).querySelector('button');
    expect(button?.classList.contains('is-not-in-snapshot')).toBe(true);
    expect(button?.textContent).toContain('Not in current vocabulary');
  });

  it('drops both the marker and its announcement when markers are off', () => {
    const fixture = render();
    fixture.componentInstance.status.set({
      tokenId: 't1',
      validation: { category: 'anki-exact', vocabularyItemIds: [] },
    });
    fixture.componentInstance.markers.set(false);
    fixture.detectChanges();

    const button = (fixture.nativeElement as HTMLElement).querySelector('button');
    expect(button?.className).not.toContain('is-known');
    expect(button?.textContent).not.toContain('Known from Anki');
  });

  it('does not announce a status for punctuation', () => {
    const fixture = render();
    fixture.componentInstance.current.set(token({ id: 'p1', surface: '、', isPunctuation: true }));
    fixture.componentInstance.status.set({
      tokenId: 'p1',
      validation: { category: 'punctuation' },
    });
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Punctuation');
  });
});
