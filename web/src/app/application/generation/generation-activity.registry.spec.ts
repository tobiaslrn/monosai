import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { GenerationActivityRegistry } from './generation-activity.registry';

describe('GenerationActivityRegistry', () => {
  it('counts nothing until a source connects, then follows it', () => {
    const registry = new GenerationActivityRegistry();
    expect(registry.runningCount()).toBe(0);

    const running = signal(2);
    registry.connect(running);
    expect(registry.runningCount()).toBe(2);

    running.set(0);
    expect(registry.runningCount()).toBe(0);
  });
});
