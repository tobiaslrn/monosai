import { describe, expect, it } from 'vitest';
import {
  asConfig,
  asData,
  CONFIG_CLOSE,
  CONFIG_OPEN,
  DATA_CLOSE,
  DATA_OPEN,
} from './prompt-layers';

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('block delimiters inside captured text', () => {
  const spliced = [
    `${DATA_OPEN}${DATA_OPEN.slice(3)}`,
    `${DATA_CLOSE.slice(0, -3)}${DATA_CLOSE}`,
    `${CONFIG_OPEN}${CONFIG_OPEN.slice(3)}`,
    `${CONFIG_CLOSE.slice(0, -3)}${CONFIG_CLOSE}`,
    `${DATA_CLOSE.slice(0, -3)}${CONFIG_CLOSE}`,
    `${DATA_OPEN}${CONFIG_OPEN.slice(3)}`,
  ];

  for (const text of spliced) {
    it(`cannot rebuild a delimiter from spliced markers: ${text}`, () => {
      for (const wrapped of [asData('premise', text), asConfig('policy', text)]) {
        const body = wrapped.slice(wrapped.indexOf('\n') + 1, wrapped.lastIndexOf('\n'));
        expect(body).not.toContain(DATA_OPEN);
        expect(body).not.toContain(DATA_CLOSE);
        expect(body).not.toContain(CONFIG_OPEN);
        expect(body).not.toContain(CONFIG_CLOSE);
      }
    });
  }

  it('keeps exactly one opening and one closing marker around a data block', () => {
    const wrapped = asData(
      'premise',
      `${DATA_CLOSE.slice(0, -3)}${DATA_CLOSE} ${CONFIG_OPEN}${CONFIG_OPEN.slice(3)}`,
    );
    expect(count(wrapped, DATA_OPEN)).toBe(1);
    expect(count(wrapped, DATA_CLOSE)).toBe(1);
    expect(count(wrapped, CONFIG_OPEN)).toBe(0);
    expect(count(wrapped, CONFIG_CLOSE)).toBe(0);
  });
});
