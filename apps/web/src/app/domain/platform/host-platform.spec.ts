import { describe, expect, it } from 'vitest';
import { detectHostPlatform } from './host-platform';

const IPAD_OS =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

describe('detectHostPlatform', () => {
  it('recognises Android, which reaches Anki through the bridge', () => {
    expect(
      detectHostPlatform({
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126.0 Mobile Safari/537.36',
        maxTouchPoints: 5,
      }),
    ).toBe('android');
  });

  it('recognises an iPhone, which can reach Anki no other way than a file', () => {
    expect(
      detectHostPlatform({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Safari',
        maxTouchPoints: 5,
      }),
    ).toBe('ios');
  });

  /**
   * iPadOS reports itself as a Macintosh. Trusting that would offer an iPad a
   * connection that can never succeed, so a Mac with several touch points is
   * treated as the iPad it almost certainly is.
   */
  it('treats a touch-capable Macintosh as an iPad', () => {
    expect(detectHostPlatform({ userAgent: IPAD_OS, maxTouchPoints: 5 })).toBe('ios');
  });

  it('leaves an ordinary Mac on the desktop path', () => {
    expect(detectHostPlatform({ userAgent: MAC, maxTouchPoints: 0 })).toBe('desktop');
  });

  it('falls back to desktop for anything it cannot place', () => {
    expect(detectHostPlatform({ userAgent: '', maxTouchPoints: 0 })).toBe('desktop');
  });
});
