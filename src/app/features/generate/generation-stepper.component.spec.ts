import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { beforeEach, describe, expect, it } from 'vitest';
import { GenerationStore } from '../../application/generation/generation.store';
import { ok } from '../../domain/shared/result';
import {
  configureGenerationTestBed,
  storyWithUnknown,
  strictStory,
  type GenerationTestBed,
} from '../../../testing/generation-fakes';
import { GenerationStepperComponent } from './generation-stepper.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GenerationStepperComponent],
  providers: [GenerationStore],
  template: `<mn-generation-stepper />`,
})
class HostComponent {}

const APPROVAL = {
  candidateId: '図書館|図書館',
  decision: 'approved' as const,
  explanationEn: 'The premise names this place, and the policy allows places I name.',
};

describe('GenerationStepperComponent', () => {
  let bed: GenerationTestBed;

  beforeEach(() => {
    bed = configureGenerationTestBed();
  });

  /**
   * The stepper reads the store its host provides, so the run is driven through
   * that instance rather than through the root one, which the page never uses.
   */
  interface Rendered {
    readonly element: HTMLElement;
    readonly store: GenerationStore;
    readonly fixture: ComponentFixture<HostComponent>;
  }

  function render(): Rendered {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const stepper = fixture.debugElement.query(By.directive(GenerationStepperComponent));
    return {
      element: fixture.nativeElement as HTMLElement,
      store: stepper.injector.get(GenerationStore),
      fixture,
    };
  }

  function stagesOf(element: HTMLElement): Record<string, string> {
    const stages: Record<string, string> = {};
    for (const node of element.querySelectorAll('li')) {
      const label = node.querySelector('.name')?.textContent.trim() ?? '';
      stages[label] = node.getAttribute('data-status') ?? '';
    }
    return stages;
  }

  it('lists the nine specified stages in order', () => {
    const { element } = render();

    expect([...element.querySelectorAll('.name')].map((node) => node.textContent.trim())).toEqual([
      'Preparing vocabulary',
      'Writing Japanese',
      'Parsing',
      'Validating vocabulary',
      'Reviewing exceptions',
      'Repairing',
      'Reviewing grammar',
      'Translating',
      'Saving',
    ]);
  });

  it('starts with everything pending', () => {
    const { element } = render();

    const stages = stagesOf(element);
    expect(stages['Preparing vocabulary']).toBe('pending');
    expect(stages['Saving']).toBe('pending');
  });

  it('completes the stages a strict run passed and skips the ones it did not need', async () => {
    const { element, store, fixture } = render();
    bed.provider.storyQueue.push(ok(strictStory()));

    await store.generate('micro', { premise: 'ねこの話。' });
    fixture.detectChanges();

    const stages = stagesOf(element);
    expect(stages['Writing Japanese']).toBe('complete');
    expect(stages['Validating vocabulary']).toBe('complete');
    expect(stages['Reviewing exceptions']).toBe('skipped');
    expect(stages['Repairing']).toBe('skipped');
    expect(stages['Saving']).toBe('complete');
  });

  it('completes the exception review when a policy was actually consulted', async () => {
    await bed.setPolicy('Allow place names I mention in the premise.');
    const { element, store, fixture } = render();
    bed.provider.storyQueue.push(ok(storyWithUnknown()));
    bed.provider.reviewQueue.push(ok([APPROVAL]));

    await store.generate('micro', { premise: 'ねこの話。' });
    fixture.detectChanges();

    expect(stagesOf(element)['Reviewing exceptions']).toBe('complete');
  });

  it('completes the repair stage and names the attempt it spent', async () => {
    const { element, store, fixture } = render();
    bed.provider.storyQueue.push(ok(storyWithUnknown()));
    bed.provider.repairQueue.push(ok(strictStory()));

    await store.generate('micro', { premise: 'ねこの話。' });
    fixture.detectChanges();

    expect(stagesOf(element)['Repairing']).toBe('complete');
    expect(element.querySelector('.detail')?.textContent).toContain('attempt 1 of 2');
  });

  it('shows grammar review and translation as skipped, because Milestone 7 does not run them', () => {
    const { element } = render();

    const stages = stagesOf(element);
    expect(stages['Reviewing grammar']).toBe('skipped');
    expect(stages['Translating']).toBe('skipped');
  });

  it('marks the failing stage rather than the whole run', async () => {
    const untested = configureGenerationTestBed({ structuredOutput: null });
    const { element, store, fixture } = render();

    await store.generate('micro', { premise: 'ねこの話。' });
    fixture.detectChanges();

    expect(untested.provider.generationCalls.story).toBe(0);
    expect(stagesOf(element)['Preparing vocabulary']).toBe('failed');
  });
});
