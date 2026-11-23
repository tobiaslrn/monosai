import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { ALL_ANKI_ERROR_CODES } from '../../../domain/anki/anki-error';
import { AI_ERROR_COPY, SPEECH_CODE_HEADING } from '../../../shared-ui/ai-error/ai-error-copy';
import { ANKI_ERROR_COPY } from '../../vocabulary/anki-error-copy';
import { TroubleshootingPageComponent } from './troubleshooting-page.component';
import { SILENT_PROBLEMS, TROUBLESHOOTING_GROUPS } from './troubleshooting';
import { textParts } from './troubleshooting-page.component';

function group(id: string) {
  const found = TROUBLESHOOTING_GROUPS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`No group ${id}`);
  return found;
}

describe('troubleshooting', () => {
  it('lists every AI failure under the heading the screen shows', () => {
    const entries = group('ai').entries;
    for (const [code, copy] of Object.entries(AI_ERROR_COPY)) {
      const entry = entries.find((candidate) => candidate.code === `ai/${code}`);
      expect(entry?.seen, code).toContain(copy.heading);
    }
    expect(entries.some((entry) => entry.seen.includes('The reply was cut off'))).toBe(true);
  });

  it('sends speech code that could not load to a reload, not a retry', () => {
    const entry = group('ai').entries.find((candidate) =>
      candidate.seen.includes(SPEECH_CODE_HEADING),
    );
    expect(entry?.text).toContain('**Story options** and select **Reload**');
    expect(entry?.text).not.toMatch(/try again/iu);
  });

  it('lists every Anki failure under the heading the screen shows', () => {
    const entries = group('anki').entries;
    for (const code of ALL_ANKI_ERROR_CODES) {
      const entry = entries.find((candidate) => candidate.code === `anki/${code}`);
      expect(entry?.seen, code).toContain(ANKI_ERROR_COPY[code].heading);
    }
  });

  /* The connect panel words a few failures for the device; both wordings must be findable. */
  it('also lists the connect panel wording of a failure', () => {
    const bridge = group('anki').entries.find((entry) => entry.code === 'anki/bridge-not-running');
    expect(bridge?.seen).toEqual(['The Anki bridge is not answering', 'The bridge is not running']);
  });

  it('writes every explanation as whole sentences', () => {
    for (const entries of [
      ...TROUBLESHOOTING_GROUPS.map((each) => each.entries),
      SILENT_PROBLEMS,
    ]) {
      for (const entry of entries) {
        expect(entry.text, entry.code ?? entry.seen.join()).toMatch(/[.!?]$/u);
        expect(() => textParts(entry.text), entry.text).not.toThrow();
      }
    }
  });

  it('sets the headings and controls in bold, and the codes as code', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(TroubleshootingPageComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const bold = [...element.querySelectorAll('strong')].map((node) => node.textContent);
    const code = [...element.querySelectorAll('code')].map((node) => node.textContent);
    expect(bold).toContain('Out of OpenRouter credit');
    expect(bold).toContain('Play sample');
    expect(code).toContain('ai/credit-exhausted');
    expect(code).toContain('anki/origin-not-allowed');
    expect(code).toContain('2055492159');
    expect(element.querySelector('a[href="/help/your-words"]')).not.toBeNull();
    expect(element.textContent).not.toMatch(/\*\*|`/u);
  });

  it('refuses a mark left open rather than styling the rest of the text', () => {
    expect(() => textParts('Select **Start.')).toThrow();
    expect(textParts('Select **Start**, then `x`.').map((part) => part.kind)).toEqual([
      'text',
      'strong',
      'text',
      'code',
      'text',
    ]);
  });

  it('lists the failures a learner meets first ahead of the rare ones', () => {
    const ai = TROUBLESHOOTING_GROUPS[0]?.entries.map((entry) => entry.code) ?? [];
    expect(ai.slice(0, 2)).toEqual(['ai/credit-exhausted', 'ai/authentication']);
  });
});
