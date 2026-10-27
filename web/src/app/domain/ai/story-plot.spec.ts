import { describe, expect, it } from 'vitest';
import { MAX_DRAFTED_PLOT_LENGTH, checkDraftedPlots, isEditedPlot } from './story-plot';

describe('checkDraftedPlots', () => {
  const three = [
    'Aiko loses her umbrella at the station.',
    'Two friends plan a picnic, but it rains.',
    'A boy finds an old letter under his desk.',
  ];

  it('accepts the requested plots, trimmed and with single spaces', () => {
    expect(checkDraftedPlots(['  One  plot. ', 'Another plot.'], 2)).toEqual({
      ok: true,
      value: ['One plot.', 'Another plot.'],
    });
    expect(checkDraftedPlots(three, 3).ok).toBe(true);
  });

  it('refuses the wrong number of plots', () => {
    expect(checkDraftedPlots(three.slice(0, 2), 3)).toEqual({ ok: false, error: 'plot-count' });
  });

  it('refuses an empty or overlong plot', () => {
    expect(checkDraftedPlots(['', three[1]!, three[2]!], 3)).toEqual({
      ok: false,
      error: 'plot-empty',
    });
    expect(
      checkDraftedPlots(['a'.repeat(MAX_DRAFTED_PLOT_LENGTH + 1), three[1]!, three[2]!], 3),
    ).toEqual({ ok: false, error: 'plot-too-long' });
  });

  it('refuses a plot that repeats another, whatever its case and punctuation', () => {
    expect(
      checkDraftedPlots([three[0]!, 'aiko loses her umbrella at the station', three[2]!], 3),
    ).toEqual({ ok: false, error: 'plot-duplicate' });
  });

  it('refuses a plot that repeats one the learner kept', () => {
    expect(checkDraftedPlots([three[1]!, three[2]!], 2, [three[1]!])).toEqual({
      ok: false,
      error: 'plot-duplicate',
    });
  });
});

describe('isEditedPlot', () => {
  it('ignores spacing at either end and notices any other change', () => {
    expect(isEditedPlot({ text: ' A plot.\n', draftedText: 'A plot.' })).toBe(false);
    expect(isEditedPlot({ text: 'A plot!', draftedText: 'A plot.' })).toBe(true);
  });
});
