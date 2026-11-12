import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  ViewEncapsulation,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink, type NavigationExtras } from '@angular/router';
import { IconComponent } from '../icon/icon.component';

/**
 * Where a step stands. `done` is finished; `next` is the one to do now and the
 * card's one primary action; `todo` can be done but is not first; `waiting`
 * cannot be done until the steps before it are, and says so as its state.
 */
export type ChecklistStepState = 'done' | 'next' | 'todo' | 'waiting';

let nextChecklistId = 0;

/**
 * A short list of first steps in one card: a heading, numbered step rows, an
 * optional quieter way round them, and a foot.
 *
 *   <mn-checklist heading="Get started">
 *     <mn-checklist-step [number]="1" heading="Add your words" state="done" link="/words">
 *       120 words
 *     </mn-checklist-step>
 *     <mn-checklist-step [number]="2" heading="Connect a model" state="next"
 *       link="/settings">Add an OpenRouter key.</mn-checklist-step>
 *     <mn-checklist-step [number]="3" heading="Write a story" state="waiting">
 *       After steps 1 and 2
 *     </mn-checklist-step>
 *     <a mn-checklist-aside mnButton="ghost" routerLink="/add">Or paste text</a>
 *     <a mn-checklist-foot mnButton="ghost" routerLink="/help">Help</a>
 *   </mn-checklist>
 *
 * The state is shown, not narrated: a finished step wears a tick and quiet
 * words, the next step wears the filled action colour on its mark and a soft ground behind it, and a waiting one is
 * dashed and is not a link. The order is the list's own.
 *
 * Styles reach projected content and are therefore global, rooted at the
 * element.
 */
@Component({
  selector: 'mn-checklist',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { role: 'region', '[attr.aria-labelledby]': 'headingId' },
  template: `
    <h2 class="mn-checklist__heading" [id]="headingId">{{ heading() }}</h2>
    <ol class="mn-checklist__steps" role="list">
      <ng-content select="mn-checklist-step" />
    </ol>
    <div class="mn-checklist__aside"><ng-content select="[mn-checklist-aside]" /></div>
    <div class="mn-checklist__foot"><ng-content select="[mn-checklist-foot]" /></div>
  `,
  styles: `
    @use '../../../styles/motion' as motion;

    mn-checklist {
      display: flex;
      flex-direction: column;
      min-width: 0;
      overflow: clip;
      border: 1px solid var(--border-subtle-faint);
      border-radius: var(--radius-card);
      background: var(--surface-raised);
      container-type: inline-size;
      @include motion.enter;
    }

    mn-checklist > .mn-checklist__heading {
      margin: 0;
      padding: var(--surface-inset) var(--surface-inset) var(--group-gap);
      font-size: var(--text-lg);
      font-weight: var(--weight-semibold);
      line-height: var(--leading-tight);
    }

    mn-checklist > .mn-checklist__steps {
      display: flex;
      flex-direction: column;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    mn-checklist > .mn-checklist__steps > mn-checklist-step + mn-checklist-step {
      border-top: 1px solid var(--border-subtle);
    }

    mn-checklist > .mn-checklist__aside {
      display: flex;
      flex-wrap: wrap;
      gap: var(--inline-gap);
      align-items: center;
      padding: var(--row-inset-block) var(--surface-inset);
      border-top: 1px solid var(--border-subtle);
      text-wrap: balance;
    }

    /*
     * Side by side where both fit. Where they do not, they stack on one edge:
     * the guide link already carries a touch target's height of its own, so
     * the rows add no gap on top of it.
     */
    mn-checklist > .mn-checklist__foot {
      display: flex;
      flex-wrap: wrap;
      gap: 0 var(--stack-gap);
      align-items: center;
      justify-content: space-between;
      padding: var(--row-inset-block) var(--surface-inset);
      border-top: 1px solid var(--border-subtle);
      background: var(--surface-sunken-faint);
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    mn-checklist > :is(.mn-checklist__aside, .mn-checklist__foot):empty {
      display: none;
    }
  `,
})
export class ChecklistComponent {
  readonly heading = input.required<string>();
  protected readonly headingId = `mn-checklist-${String(nextChecklistId++)}-heading`;
}

/**
 * One step of a checklist: its number (a tick once done), its title, one line
 * saying where it stands, and — for the next step — the verb that does it.
 * Every step but a waiting one is a link to where it is done.
 */
@Component({
  selector: 'mn-checklist-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [IconComponent, NgTemplateOutlet, RouterLink],
  host: {
    role: 'listitem',
    '[attr.data-state]': 'state()',
  },
  template: `
    <ng-template #body>
      <span class="mn-checklist-step__mark" aria-hidden="true">
        @if (state() === 'done') {
          <mn-icon name="check" [size]="16" />
        } @else {
          {{ number() }}
        }
      </span>
      <span class="mn-checklist-step__text">
        <span class="mn-checklist-step__title" [id]="titleId">{{ heading() }}</span>
        <span class="mn-checklist-step__detail" [id]="detailId">
          @if (stateWords(); as words) {
            <span class="mn-visually-hidden">{{ words }} </span>
          }
          <ng-content />
        </span>
      </span>
      @if (state() !== 'waiting') {
        <mn-icon class="mn-checklist-step__chevron" name="chevron-right" [size]="18" />
      }
    </ng-template>

    @if (state() !== 'waiting' && link() !== null) {
      <a
        class="mn-checklist-step__main"
        [routerLink]="link()"
        [fragment]="fragment()"
        [state]="navigationState()"
        [attr.data-testid]="testId()"
        [attr.aria-labelledby]="titleId"
        [attr.aria-describedby]="detailId"
      >
        <ng-container [ngTemplateOutlet]="body" />
      </a>
    } @else {
      <div
        class="mn-checklist-step__main"
        [attr.data-testid]="testId()"
        [attr.aria-disabled]="state() === 'waiting' ? 'true' : null"
      >
        <ng-container [ngTemplateOutlet]="body" />
      </div>
    }
  `,
  styles: `
    @use '../../../styles/motion' as motion;

    mn-checklist-step {
      display: block;
      min-width: 0;
    }

    mn-checklist-step > .mn-checklist-step__main {
      display: flex;
      gap: var(--space-2) var(--glyph-gap);
      align-items: center;
      min-width: 0;
      min-height: var(--row-min-height);
      padding: var(--row-inset-block) var(--surface-inset);
      color: var(--text-primary);
      text-decoration: none;
      @include motion.state(background-color);
    }

    :where(html[data-pointer='mouse']) mn-checklist-step > a.mn-checklist-step__main:where(:hover),
    mn-checklist-step > a.mn-checklist-step__main:where(:active) {
      background: var(--surface-sunken);
    }

    mn-checklist-step > a.mn-checklist-step__main:focus-visible {
      outline: 3px solid var(--focus-ring);
      outline-offset: -3px;
    }

    /* The next step is the card's one primary: a soft action ground behind it. */
    mn-checklist-step[data-state='next'] > .mn-checklist-step__main {
      background: var(--action-primary-soft);
    }

    :where(html[data-pointer='mouse'])
      mn-checklist-step[data-state='next']
      > a.mn-checklist-step__main:where(:hover),
    mn-checklist-step[data-state='next'] > a.mn-checklist-step__main:where(:active) {
      background: var(--action-primary-soft-hover);
    }

    mn-checklist-step .mn-checklist-step__mark {
      display: inline-grid;
      flex: none;
      place-items: center;
      width: 1.75rem;
      height: 1.75rem;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-pill);
      color: var(--text-secondary);
      font-size: var(--text-sm);
      font-weight: var(--weight-semibold);
      font-variant-numeric: tabular-nums;
      @include motion.state(background-color, border-color, color);
    }

    mn-checklist-step[data-state='next'] .mn-checklist-step__mark {
      border-color: var(--action-primary);
      background: var(--action-primary);
      color: var(--text-on-action);
    }

    mn-checklist-step[data-state='done'] .mn-checklist-step__mark {
      border-color: var(--status-success);
      background: var(--status-success-soft);
      color: var(--status-success);
    }

    mn-checklist-step[data-state='waiting'] .mn-checklist-step__mark {
      border-style: dashed;
      border-color: var(--border-subtle);
    }

    mn-checklist-step .mn-checklist-step__text {
      display: flex;
      flex: 1 1 10rem;
      flex-direction: column;
      gap: var(--line-gap);
      min-width: 0;
    }

    mn-checklist-step .mn-checklist-step__title {
      font-size: var(--text-md);
      font-weight: var(--weight-semibold);
      line-height: var(--leading-snug);
    }

    mn-checklist-step .mn-checklist-step__detail {
      text-wrap: balance;
      color: var(--text-secondary);
      font-size: var(--text-sm);
      line-height: var(--leading-snug);
    }

    /* Finished and waiting steps step back: their titles go quiet. */
    mn-checklist-step:is([data-state='done'], [data-state='waiting']) .mn-checklist-step__title {
      color: var(--text-secondary);
      font-weight: var(--weight-medium);
    }

    mn-checklist-step[data-state='next'] .mn-checklist-step__title {
      color: var(--action-primary-text);
    }

    mn-checklist-step .mn-checklist-step__chevron {
      flex: none;
      color: var(--text-secondary);
    }
  `,
})
export class ChecklistStepComponent {
  private readonly instance = nextChecklistId++;
  protected readonly titleId = `mn-checklist-step-${String(this.instance)}-title`;
  protected readonly detailId = `mn-checklist-step-${String(this.instance)}-detail`;

  readonly number = input.required<number>();
  readonly heading = input.required<string>();
  readonly state = input.required<ChecklistStepState>();
  readonly link = input<string | null>(null);
  readonly fragment = input<string | undefined>(undefined);
  readonly navigationState = input<NavigationExtras['state']>(undefined);
  readonly testId = input<string | null>(null);

  /** What the mark says to assistive technology, before the step's own line. */
  protected readonly stateWords = computed(() => {
    switch (this.state()) {
      case 'done':
        return 'Done';
      case 'next':
        return 'Next';
      case 'waiting':
        return 'Waiting';
      case 'todo':
        return null;
    }
  });
}
