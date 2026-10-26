import { describe, expect, it } from 'vitest';
import type { AudioTimeline } from './audio-player';
import { ContinuousTrack } from './continuous-track';

function timeline(starts: readonly number[], options: Partial<AudioTimeline> = {}): AudioTimeline {
  return { starts, duration: starts.length * 2, open: false, floor: 0, ...options };
}

describe('ContinuousTrack', () => {
  /**
   * A resource that starts partway through the reading indexes from its own
   * first sentence. Every method takes reading indices, so the offset is
   * applied here and nowhere else.
   */
  it('maps reading indices onto a resource that starts partway through', () => {
    const track = new ContinuousTrack(timeline([0, 2, 4]), 3, 'playback', ['a', 'b', 'c']);

    expect(track.timeOf(2)).toBeNull();
    expect(track.timeOf(3)).toBe(0);
    expect(track.timeOf(5)).toBe(4);
    expect(track.timeOf(6)).toBeNull();
    expect(track.lastIndex()).toBe(5);
  });

  it('never names a start below audio that has been evicted', () => {
    const track = new ContinuousTrack(timeline([0, 2, 4], { floor: 3 }), 0, 'playback', []);

    expect(track.timeOf(0)).toBe(3);
    expect(track.timeOf(2)).toBe(4);
    expect(track.clamp(1)).toBe(3);
    expect(track.clamp(99)).toBe(6);
  });

  it('spans a sentence to the start of the next, and the last one to the end', () => {
    const track = new ContinuousTrack(timeline([0, 2, 4]), 1, 'baked', []);

    expect(track.span(1)).toEqual({ start: 0, end: 2 });
    expect(track.span(3)).toEqual({ start: 4, end: 6 });
    expect(track.span(0)).toBeNull();
    expect(track.span(4)).toBeNull();
  });

  it('names the sentence being heard at a position, in reading indices', () => {
    const track = new ContinuousTrack(timeline([0, 2, 4]), 2, 'playback', []);

    expect(track.sentenceAt(0)).toEqual({ index: 2, start: 0 });
    expect(track.sentenceAt(2)).toEqual({ index: 3, start: 2 });
    expect(track.sentenceAt(5.5)).toEqual({ index: 4, start: 4 });
  });

  it('records appends, keeping the keys in reading order', () => {
    const track = new ContinuousTrack(timeline([0], { open: true }), 0, 'playback', ['a']);

    track.extend(timeline([0, 2, 4], { open: true }), ['b', 'c']);

    expect(track.keys).toEqual(['a', 'b', 'c']);
    expect(track.lastIndex()).toBe(2);
    expect(track.open).toBe(true);
  });

  it('seals once, and says so only the first time', () => {
    const track = new ContinuousTrack(timeline([0], { open: true }), 0, 'playback', ['a']);

    expect(track.seal()).toBe(true);
    expect(track.open).toBe(false);
    expect(track.seal()).toBe(false);
  });

  it('does not share the key list it was built from', () => {
    const keys = ['a'];
    const track = new ContinuousTrack(timeline([0], { open: true }), 0, 'playback', keys);

    track.extend(timeline([0, 2], { open: true }), ['b']);

    expect(keys).toEqual(['a']);
  });
});
