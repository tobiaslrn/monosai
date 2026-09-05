import { describe, expect, it } from 'vitest';
import { isOpenRouterUrl, OPENROUTER_BASE_URL } from './openrouter-endpoints';

describe('isOpenRouterUrl', () => {
  it('accepts the base and paths beneath it', () => {
    expect(isOpenRouterUrl(OPENROUTER_BASE_URL)).toBe(true);
    expect(isOpenRouterUrl(`${OPENROUTER_BASE_URL}/chat/completions`)).toBe(true);
  });

  it('rejects another origin', () => {
    expect(isOpenRouterUrl('https://openrouter.ai.evil.test/api/v1/chat')).toBe(false);
    expect(isOpenRouterUrl('http://openrouter.ai/api/v1/chat')).toBe(false);
  });

  it('rejects a path that escapes the base through traversal', () => {
    expect(isOpenRouterUrl(`${OPENROUTER_BASE_URL}/../../evil`)).toBe(false);
  });

  it('rejects a sibling path that merely shares the prefix', () => {
    expect(isOpenRouterUrl('https://openrouter.ai/api/v11/chat')).toBe(false);
  });

  it('rejects something that is not a URL at all', () => {
    expect(isOpenRouterUrl('not a url')).toBe(false);
  });
});
