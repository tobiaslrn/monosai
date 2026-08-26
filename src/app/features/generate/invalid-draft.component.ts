import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type {
  InvalidDraft,
  InvalidDraftSentence,
} from '../../application/generation/generation.store';
import { IconComponent } from '../../shared-ui/icon/icon.component';

/** A run of text and whether it is one of the words that kept the story out. */
interface MarkedSegment {
  readonly text: string;
  readonly isUnknown: boolean;
}

interface MarkedLine {
  readonly segments: readonly MarkedSegment[];
}

/**
 * Splits a sentence around the surfaces that failed validation.
 *
 * The marking is done on the exact stored text and only ever slices it, so what
 * is shown is what the model wrote — a draft that displayed anything else would
 * be useless for deciding whether to change the premise.
 */
function mark(textJa: string, surfaces: readonly string[]): MarkedLine {
  if (surfaces.length === 0) {
    return { segments: [{ text: textJa, isUnknown: false }] };
  }

  const segments: MarkedSegment[] = [];
  let cursor = 0;
  while (cursor < textJa.length) {
    const found = surfaces
      .map((surface) => ({ surface, at: textJa.indexOf(surface, cursor) }))
      .filter((candidate) => candidate.at !== -1)
      .sort((left, right) => left.at - right.at);
    if (found.length === 0) {
      segments.push({ text: textJa.slice(cursor), isUnknown: false });
      break;
    }
    const hit = found[0];
    if (hit.at > cursor) {
      segments.push({ text: textJa.slice(cursor, hit.at), isUnknown: false });
    }
    segments.push({ text: hit.surface, isUnknown: true });
    cursor = hit.at + hit.surface.length;
  }
  return { segments };
}

/**
 * A story that never validated, shown but never saved.
 *
 * There is deliberately no "Save anyway": the whole point of a generated story
 * is that every word in it is one the learner has reviewed or their own policy
 * approved, and a story with an unknown in it would quietly break that promise
 * for every reader of the library afterwards.
 *
 * The Japanese is still shown, with the offending words marked, because seeing
 * what the model produced is how a learner decides whether to change the
 * premise or simply try again.
 */
@Component({
  selector: 'mn-invalid-draft',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent],
  template: `
    <div class="heading">
      <mn-icon name="warning" [size]="20" />
      <h3>This story was not saved</h3>
    </div>

    <p class="mn-hint">
      After
      {{ draft().repairAttempts }} repair
      {{ draft().repairAttempts === 1 ? 'attempt' : 'attempts' }}, it still does not have the shape
      that was asked for. Nothing was added to your library.
    </p>

    <article class="story" lang="ja" data-testid="invalid-draft-text">
      <h4>
        @for (segment of title().segments; track $index) {
          @if (segment.isUnknown) {
            <span class="unknown"
              >{{ segment.text
              }}<span class="mn-visually-hidden" lang="en"> (unknown vocabulary)</span></span
            >
          } @else {
            <span>{{ segment.text }}</span>
          }
        }
      </h4>
      @for (line of lines(); track $index) {
        <p>
          @for (segment of line.segments; track $index) {
            @if (segment.isUnknown) {
              <span class="unknown"
                >{{ segment.text
                }}<span class="mn-visually-hidden" lang="en"> (unknown vocabulary)</span></span
              >
            } @else {
              <span>{{ segment.text }}</span>
            }
          }
        </p>
      }
    </article>

    <h4 class="issues-heading">What kept it out</h4>
    <ul class="issues" data-testid="invalid-draft-issues">
      @for (issue of draft().issues; track issue) {
        <li>{{ issue }}</li>
      }
    </ul>

    <div class="actions">
      <button
        type="button"
        class="mn-button mn-button--primary"
        data-testid="try-again"
        (click)="tryAgain.emit()"
      >
        Try a new generation
      </button>
      <button
        type="button"
        class="mn-button"
        data-testid="change-premise"
        (click)="changePremise.emit()"
      >
        Change premise or instructions
      </button>
      <button
        type="button"
        class="mn-button"
        data-testid="close-draft"
        (click)="closeRequested.emit()"
      >
        Close
      </button>
    </div>

    <p class="mn-hint">
      If this keeps happening, an easier
      <a routerLink="/grammar">grammar preset</a>
      or more reviewed
      <a routerLink="/vocabulary">vocabulary</a>
      usually helps more than trying again.
    </p>
  `,
  styles: `
    .heading {
      display: flex;
      gap: var(--space-2);
      align-items: center;
      color: var(--status-warning);
    }

    .heading h3 {
      margin: 0;
      font-size: 18px;
    }

    .story {
      padding: var(--space-4);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-card);
      background: var(--surface-sunken);
    }

    .story h4 {
      margin: 0 0 var(--space-3);
    }

    .story p {
      margin: 0 0 var(--space-2);
      line-height: 1.9;
    }

    /* Coral wavy underline: the reader's treatment for unknown vocabulary. */
    .unknown {
      color: var(--status-danger);
      text-decoration: underline wavy var(--status-danger);
      text-underline-offset: 0.3em;
    }

    .issues-heading {
      margin: 0;
      font-size: 16px;
    }

    .issues {
      margin: 0;
      padding-inline-start: var(--space-5);
      color: var(--text-secondary);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
  `,
})
export class InvalidDraftComponent {
  readonly draft = input.required<InvalidDraft>();

  protected readonly title = computed(() =>
    mark(this.draft().titleJa, this.draft().titleUnknownSurfaces),
  );

  protected readonly lines = computed<readonly MarkedLine[]>(() =>
    this.draft().sentences.map((sentence: InvalidDraftSentence) =>
      mark(sentence.textJa, sentence.unknownSurfaces),
    ),
  );

  readonly tryAgain = output<void>();
  readonly changePremise = output<void>();
  readonly closeRequested = output<void>();
}
