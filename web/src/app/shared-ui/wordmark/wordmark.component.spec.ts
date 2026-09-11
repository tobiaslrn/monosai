import { TestBed } from '@angular/core/testing';
import { WordmarkComponent } from './wordmark.component';
import { kana } from './wordmark-glyphs';
import { WORDMARK_RANDOM } from './wordmark.state';

async function render() {
  TestBed.configureTestingModule({
    imports: [WordmarkComponent],
    // Lands on kana.
    providers: [{ provide: WORDMARK_RANDOM, useValue: () => 0.9 }],
  });
  const fixture = TestBed.createComponent(WordmarkComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

function frames(host: HTMLElement): (string | null)[] {
  return [...host.querySelectorAll('svg')].map((frame) => frame.getAttribute('viewBox'));
}

describe('WordmarkComponent', () => {
  it('is hidden from assistive technology', async () => {
    const fixture = await render();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('.reel')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('spins on its first appearance and rests on the landing', async () => {
    const fixture = await render();
    const host = fixture.nativeElement as HTMLElement;
    const all = frames(host);

    expect(host.querySelector('.reel.is-spinning')).not.toBeNull();
    expect(all.at(-1)).toBe(kana.viewBox);
  });

  it('stands still on a later appearance', async () => {
    await render();
    const second = TestBed.createComponent(WordmarkComponent);
    second.detectChanges();
    const host = second.nativeElement as HTMLElement;

    expect(host.querySelector('.reel.is-spinning')).toBeNull();
    expect(frames(host)[0]).toBe(kana.viewBox);
  });
});
