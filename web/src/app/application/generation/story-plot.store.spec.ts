import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { aiError } from '../../domain/ai/ai-error';
import { EMPTY_STORY_DIRECTION, toggleOption } from '../../domain/ai/story-direction';
import { ROLLED_STORY_AXES } from '../../domain/ai/story-direction-options';
import { PLOT_VOCABULARY_SAMPLE_SIZE, RECENT_STORY_COUNT } from '../../domain/ai/story-plot';
import { err, ok } from '../../domain/shared/result';
import {
  configureGenerationTestBed,
  type GenerationTestBed,
} from '../../../testing/generation-fakes';
import { buildReading } from '../../../testing/reading-repository-fake';
import { StoryPlotStore } from './story-plot.store';

const PLOTS = [
  'Aiko loses her umbrella at the station and has to ask a stranger for help.',
  'Two old friends plan a picnic, but a phone call changes the day.',
  'A boy finds a letter under his desk that was meant for his teacher.',
] as const;

describe('StoryPlotStore', () => {
  let bed: GenerationTestBed;
  let plots: StoryPlotStore;

  beforeEach(() => {
    bed = configureGenerationTestBed({ uniqueEntryCount: 60 });
    plots = TestBed.inject(StoryPlotStore);
  });

  it('drafts three plots in one request and offers them ready to pick', async () => {
    bed.provider.plotQueue.push(ok(PLOTS));

    await plots.prepare(EMPTY_STORY_DIRECTION, '  Keep it gentle. ');

    expect(bed.provider.generationCalls.plots).toBe(1);
    const request = bed.provider.plotRequests[0];
    expect(request.frames).toHaveLength(3);
    expect(request.keptPlots).toEqual([]);
    expect(request.learnerNotes).toBe('Keep it gentle.');
    expect(request.promptVersion).toBe('plots/2');
    expect(request.vocabularySample.length).toBeGreaterThan(0);
    expect(request.vocabularySample.length).toBeLessThanOrEqual(PLOT_VOCABULARY_SAMPLE_SIZE);
    expect(plots.status()).toBe('ready');
    expect(plots.cards().map((card) => card.text)).toEqual(PLOTS);
    expect(plots.isReady()).toBe(true);
  });

  it('rolls three different frames when everything is on Any', async () => {
    bed.provider.plotQueue.push(ok(PLOTS));

    await plots.prepare(EMPTY_STORY_DIRECTION, '');

    const frames = bed.provider.plotRequests[0].frames;
    for (const axis of ROLLED_STORY_AXES) {
      expect(new Set(frames.map((frame) => frame.values[axis][0]?.value)).size).toBe(3);
    }
    expect(new Set(frames.map((frame) => frame.turningPoint.label)).size).toBe(3);
  });

  it('tells the request about the newest stories so it can stay clear of them', async () => {
    for (let index = 0; index < RECENT_STORY_COUNT + 2; index += 1) {
      const { reading } = buildReading({
        id: `r${String(index)}`,
        kind: 'generated',
        title: `話${String(index)}`,
        createdAt: 1_700_000_000_000 + index,
      });
      bed.readings.readings.push(reading);
    }
    bed.provider.plotQueue.push(ok(PLOTS));

    await plots.prepare(EMPTY_STORY_DIRECTION, '');

    const recent = bed.provider.plotRequests[0].recentStories;
    expect(recent).toHaveLength(RECENT_STORY_COUNT);
    expect(recent[0].titleJa).toBe(`話${String(RECENT_STORY_COUNT + 1)}`);
  });

  it('does not pay again for the same direction, and drafts again for a changed one', async () => {
    bed.provider.plotQueue.push(ok(PLOTS), ok(PLOTS));

    await plots.prepare(EMPTY_STORY_DIRECTION, '');
    await plots.prepare(EMPTY_STORY_DIRECTION, '');
    expect(bed.provider.generationCalls.plots).toBe(1);

    await plots.prepare(toggleOption(EMPTY_STORY_DIRECTION, 'mood', 'Cozy'), '');
    expect(bed.provider.generationCalls.plots).toBe(2);
    expect(
      bed.provider.plotRequests[1].frames.every(
        (frame) => frame.values.mood[0]?.value === 'Cozy' && !frame.values.mood[0].rolled,
      ),
    ).toBe(true);
  });

  it('regenerates only the plots the learner has not edited, and keeps the edit in place', async () => {
    bed.provider.plotQueue.push(ok(PLOTS), ok(['A new plot.', 'Another new plot.']));
    await plots.prepare(EMPTY_STORY_DIRECTION, '');
    plots.edit(1, 'My own plot about my cat.');
    const keptFrame = plots.cards()[1].frame;

    await plots.regenerate(EMPTY_STORY_DIRECTION, '');

    const request = bed.provider.plotRequests[1];
    expect(request.frames).toHaveLength(2);
    expect(request.keptPlots).toEqual(['My own plot about my cat.']);
    expect(plots.cards().map((card) => card.text)).toEqual([
      'A new plot.',
      'My own plot about my cat.',
      'Another new plot.',
    ]);
    expect(plots.cards()[1].frame).toBe(keptFrame);
    expect(request.frames.map((frame) => frame.turningPoint.label)).not.toContain(
      keptFrame.turningPoint.label,
    );
  });

  it('keeps an edited plot when the direction changes', async () => {
    bed.provider.plotQueue.push(ok(PLOTS), ok(['One.', 'Two.']));
    await plots.prepare(EMPTY_STORY_DIRECTION, '');
    plots.edit(0, 'Mine.');

    await plots.prepare(toggleOption(EMPTY_STORY_DIRECTION, 'genre', 'Mystery'), '');

    expect(bed.provider.plotRequests[1].frames).toHaveLength(2);
    expect(plots.cards().map((card) => card.text)).toEqual(['Mine.', 'One.', 'Two.']);
  });

  it('has nothing to regenerate once every plot is the learner’s', async () => {
    bed.provider.plotQueue.push(ok(PLOTS));
    await plots.prepare(EMPTY_STORY_DIRECTION, '');
    plots.edit(0, 'a');
    plots.edit(1, 'b');
    plots.edit(2, 'c');

    expect(plots.canRegenerate()).toBe(false);
    await plots.regenerate(EMPTY_STORY_DIRECTION, '');
    expect(bed.provider.generationCalls.plots).toBe(1);
  });

  it('reports a failed draft and keeps earlier plots usable', async () => {
    bed.provider.plotQueue.push(
      ok(PLOTS),
      err(aiError('rate-limited', 'story-plots', 'Too many requests.')),
    );
    await plots.prepare(EMPTY_STORY_DIRECTION, '');

    await plots.regenerate(EMPTY_STORY_DIRECTION, '');

    expect(plots.status()).toBe('failed');
    expect(plots.failure()).toMatchObject({ code: 'rate-limited' });
    expect(plots.cards().map((card) => card.text)).toEqual(PLOTS);
    expect(plots.isReady()).toBe(true);
  });

  it('turns the picked plot into a premise and a record, with any edit', async () => {
    bed.provider.plotQueue.push(ok(PLOTS));
    const direction = toggleOption(EMPTY_STORY_DIRECTION, 'mood', 'Funny');
    await plots.prepare(direction, '');
    plots.select(2);
    plots.edit(2, `  ${PLOTS[2]} It is raining.  `);

    const chosen = plots.chosenPlot(direction);

    expect(chosen?.premise).toBe(`${PLOTS[2]} It is raining.`);
    expect(chosen?.plot.frame).toBe(plots.cards()[2].frame);
    expect(chosen?.plot.record).toMatchObject({
      selected: { mood: ['Funny'] },
      plotEn: `${PLOTS[2]} It is raining.`,
      draftedPlotEn: PLOTS[2],
    });
  });

  it('refuses an emptied plot as a premise', async () => {
    bed.provider.plotQueue.push(ok(PLOTS));
    await plots.prepare(EMPTY_STORY_DIRECTION, '');
    plots.edit(0, '   ');

    expect(plots.selectedIssue()).toBe('empty');
    expect(plots.isReady()).toBe(false);
    expect(plots.chosenPlot(EMPTY_STORY_DIRECTION)).toBeNull();
  });

  it('drafts afresh after a story was written, and hands a plot back from a run that wrote nothing', async () => {
    bed.provider.plotQueue.push(ok(PLOTS), ok(['One.', 'Two.', 'Three.']));
    await plots.prepare(EMPTY_STORY_DIRECTION, '');
    plots.select(1);
    const sent = plots.chosenPlot(EMPTY_STORY_DIRECTION);
    if (sent === null) throw new Error('fixture');

    plots.spend();
    await plots.prepare(EMPTY_STORY_DIRECTION, '');
    expect(bed.provider.generationCalls.plots).toBe(2);
    expect(plots.cards().map((card) => card.text)).toEqual(['One.', 'Two.', 'Three.']);

    // The run fails long after the learner drafted again: its plot comes back, picked.
    plots.restore(sent.plot, EMPTY_STORY_DIRECTION, '');
    expect(plots.selected()?.text).toBe(PLOTS[1]);
    expect(plots.cards()).toHaveLength(3);
    expect(plots.isReady()).toBe(true);

    // Handing back what is already on offer only picks it.
    plots.restore(sent.plot, EMPTY_STORY_DIRECTION, '');
    expect(plots.cards()).toHaveLength(3);
  });

  it('hands one run its plot back without unspending another run’s', async () => {
    bed.provider.plotQueue.push(ok(PLOTS), ok(['One.', 'Two.', 'Three.']));
    await plots.prepare(EMPTY_STORY_DIRECTION, '');
    plots.select(0);
    const first = plots.chosenPlot(EMPTY_STORY_DIRECTION);
    plots.spend();
    plots.select(2);
    plots.spend();
    if (first === null) throw new Error('fixture');

    plots.restore(first.plot, EMPTY_STORY_DIRECTION, '');
    plots.edit(0, `${PLOTS[0]} Edited.`);
    await plots.prepare(toggleOption(EMPTY_STORY_DIRECTION, 'mood', 'Cozy'), '');

    // The third plot was sent and stays sent; the first is the learner's again.
    const texts = plots.cards().map((card) => card.text);
    expect(texts).not.toContain(PLOTS[2]);
    expect(texts).toContain(`${PLOTS[0]} Edited.`);
  });

  it('asks for nothing when every plot is the learner’s, and tells them what was chosen now', async () => {
    bed.provider.plotQueue.push(ok(PLOTS));
    await plots.prepare(toggleOption(EMPTY_STORY_DIRECTION, 'mood', 'Funny'), '');
    plots.edit(0, 'a');
    plots.edit(1, 'b');
    plots.edit(2, 'c');

    const sad = toggleOption(EMPTY_STORY_DIRECTION, 'mood', 'Sad');
    await plots.prepare(sad, '');

    expect(bed.provider.generationCalls.plots).toBe(1);
    expect(plots.status()).toBe('ready');
    expect(plots.cards()[0].frame.values.mood).toEqual([{ value: 'Sad', rolled: false }]);
    expect(plots.chosenPlot(sad)?.plot.record.frame.mood).toEqual([
      { value: 'Sad', rolled: false },
    ]);
  });

  it('keeps the learner’s pick on their edited plot when the direction changes', async () => {
    bed.provider.plotQueue.push(ok(PLOTS), ok(['One.', 'Two.']));
    await plots.prepare(EMPTY_STORY_DIRECTION, '');
    plots.select(1);
    plots.edit(1, 'Mine.');

    await plots.prepare(toggleOption(EMPTY_STORY_DIRECTION, 'genre', 'Drama'), '');

    expect(plots.selected()?.text).toBe('Mine.');
  });

  it('does not count spacing at either end as an edit', async () => {
    bed.provider.plotQueue.push(ok(PLOTS), ok(PLOTS.map((plot) => `${plot} Again.`)));
    await plots.prepare(EMPTY_STORY_DIRECTION, '');
    plots.edit(0, `${PLOTS[0]}\n`);

    await plots.regenerate(EMPTY_STORY_DIRECTION, '');

    expect(bed.provider.plotRequests[1].frames).toHaveLength(3);
  });
});
