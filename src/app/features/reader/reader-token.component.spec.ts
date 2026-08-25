import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { Token } from '../../domain/reading/token';
import type { TokenStatusAssignment } from '../../domain/reading/validation';
import { PointerModalityService } from '../../core/platform/pointer-modality.service';
import { ReaderTokenComponent, type TokenActivationSource } from './reader-token.component';

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
      [grammarConcern]="concern()"
      (activated)="activations.push($event)"
      (previewed)="previews.push($event)"
    />
  `,
})
class HostComponent {
  readonly current = signal<Token>(token());
  readonly status = signal<TokenStatusAssignment | null>(null);
  readonly furigana = signal(true);
  readonly markers = signal(true);
  readonly concern = signal(false);
  readonly activations: TokenActivationSource[] = [];
  readonly previews: TokenActivationSource[] = [];
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

  it('activates on click, carrying the button the popover anchors to', () => {
    const fixture = render();
    const element = fixture.nativeElement as HTMLElement;

    element.querySelector('button')?.click();
    const [activation] = fixture.componentInstance.activations;
    expect(fixture.componentInstance.activations).toHaveLength(1);
    expect(activation.token.surface).toBe('猫');
    expect(activation.origin).toBe(element.querySelector('button'));
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

  /**
   * The hover preview belongs to a mouse and a keyboard. A tap both focuses a
   * word and synthesizes a pointer entering it, so on a phone every tap used
   * to raise a preview card that the tap's own details card then replaced.
   */
  it('previews on hover and focus for a mouse', () => {
    const fixture = render();
    const button = (fixture.nativeElement as HTMLElement).querySelector('button');

    button?.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
    button?.dispatchEvent(new FocusEvent('focus'));

    expect(fixture.componentInstance.previews).toHaveLength(2);
  });

  it('stays silent for a finger, which has no hover to offer', () => {
    // Instantiated first, so the service is listening when the finger lands.
    TestBed.inject(PointerModalityService);
    document.body.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }),
    );
    const fixture = render();
    const button = (fixture.nativeElement as HTMLElement).querySelector('button');

    button?.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'touch' }));
    button?.dispatchEvent(new FocusEvent('focus'));

    expect(fixture.componentInstance.previews).toHaveLength(0);
    // The tap itself still opens the word.
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

  it('keeps the annotation out of the word, so the line around it stays the sentence', () => {
    // The button is the ruby base rather than the ruby's parent: a press on the
    // furigana, or anywhere else in the loose line, belongs to the sentence.
    const element = render().nativeElement as HTMLElement;
    const rt = element.querySelector('rt');

    expect(rt?.closest('button')).toBeNull();
    expect(element.querySelector('button')?.closest('ruby')).not.toBeNull();
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

  it('marks a warning with a class and an accessible label, not colour alone', () => {
    const fixture = render();
    fixture.componentInstance.status.set({
      tokenId: 't1',
      validation: { category: 'not-in-snapshot' },
    });
    fixture.detectChanges();

    const button = (fixture.nativeElement as HTMLElement).querySelector('button');
    expect(button?.classList.contains('is-warning-vocabulary')).toBe(true);
    expect(button?.textContent).toContain('Not in current vocabulary');
  });

  it('leaves a word that is not a warning completely unmarked', () => {
    // The reader marks warnings and nothing else: a known word gets no ink and
    // no announcement, and what its status says is left to word details.
    const fixture = render();
    fixture.componentInstance.status.set({
      tokenId: 't1',
      validation: { category: 'anki-exact', vocabularyItemIds: [] },
    });
    fixture.detectChanges();

    const button = (fixture.nativeElement as HTMLElement).querySelector('button');
    expect(button?.className).not.toContain('is-');
    expect(button?.textContent).not.toContain('Known from Anki');
  });

  it('marks unfamiliar grammar on the host, so both warnings can show at once', () => {
    const fixture = render();
    fixture.componentInstance.status.set({
      tokenId: 't1',
      validation: { category: 'unknown', reason: 'not-in-vocabulary' },
    });
    fixture.componentInstance.concern.set(true);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const host = element.querySelector('mn-reader-token');
    expect(host?.classList.contains('has-grammar-concern')).toBe(true);
    expect(element.querySelector('button')?.classList.contains('is-warning-vocabulary')).toBe(true);
    expect(element.textContent).toContain('unfamiliar grammar');
  });

  it('drops both the marker and its announcement when markers are off', () => {
    const fixture = render();
    fixture.componentInstance.status.set({
      tokenId: 't1',
      validation: { category: 'unknown', reason: 'not-in-vocabulary' },
    });
    fixture.componentInstance.markers.set(false);
    fixture.detectChanges();

    const button = (fixture.nativeElement as HTMLElement).querySelector('button');
    expect(button?.className).not.toContain('is-warning-vocabulary');
    expect(button?.textContent).not.toContain('Unknown vocabulary');
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
