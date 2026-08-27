import { describe, expect, it } from 'vitest';
import { ALL_AI_TASKS } from './ai-task';
import { temperatureForTask } from './sampling';

describe('temperatureForTask', () => {
  it('pins every judgement task low, so the same input tends to the same answer', () => {
    for (const task of [
      'translation',
      'grammar-review',
      'exception-review',
      'story-repair',
    ] as const) {
      const temperature = temperatureForTask(task);
      expect(temperature).toBeDefined();
      expect(temperature).toBeLessThanOrEqual(0.2);
    }
  });

  it('leaves story writing warm, because varying between runs is the point', () => {
    expect(temperatureForTask('story-generation')).toBeGreaterThan(0.5);
  });

  it('sends nothing for tasks that do not sample text', () => {
    expect(temperatureForTask('tts-synthesis')).toBeUndefined();
    expect(temperatureForTask('model-discovery')).toBeUndefined();
  });

  it('never names a task that does not exist', () => {
    const known = new Set<string>(ALL_AI_TASKS);
    for (const task of ALL_AI_TASKS) {
      expect(known.has(task)).toBe(true);
      const temperature = temperatureForTask(task);
      if (temperature !== undefined) {
        expect(temperature).toBeGreaterThanOrEqual(0);
        expect(temperature).toBeLessThanOrEqual(2);
      }
    }
  });
});
