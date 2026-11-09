import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';

/**
 * A column of explanation: Help's sections, headings, paragraphs, and lists.
 *
 * Its styles reach projected content, so they are global, and they are kept
 * from leaking in two ways. They name only bare elements — never a class — so
 * a row, a card, or a button placed in the prose keeps its own look. And every
 * selector is wrapped in `:where()`, so it adds no specificity and any
 * primitive's own rule wins.
 *
 * A section is a stack, so nothing in it needs a margin: a notice, a card, or
 * a row placed between paragraphs gets the same gap as a paragraph.
 *
 * Two roles are marked with attributes rather than classes:
 *
 *   <p mn-lead>        the opening line, larger and quieter
 *   <p mn-checked>     the day the facts on the page were last checked
 */
@Component({
  selector: 'mn-prose',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `<ng-content />`,
  styles: `
    mn-prose {
      display: flex;
      flex-direction: column;
      gap: var(--page-gap);
      min-width: 0;
    }

    /* A section is a stack: its blocks keep one gap and carry no margins. */
    :where(mn-prose) > :where(section) {
      display: flex;
      flex-direction: column;
      gap: var(--stack-gap);
      min-width: 0;
      border-top: 1px solid var(--border-subtle);
      padding-top: var(--page-gap);
    }

    :where(mn-prose) > :where(section:first-child) {
      border-top: 0;
      padding-top: 0;
    }

    :where(mn-prose, mn-prose > section) > :where(h2) {
      margin-bottom: var(--space-1);
      font-size: var(--text-xl);
    }

    :where(mn-prose, mn-prose > section) > :where(h3) {
      margin-top: var(--space-2);
      font-size: var(--text-lg);
    }

    /* The column is already a reading measure, so paragraphs fill it and share the cards' edges. */
    :where(mn-prose, mn-prose > section) > :where(p, ul, ol) {
      margin: 0;
    }

    :where(mn-prose, mn-prose > section) > :where(ul, ol) {
      padding-inline-start: var(--space-5);
    }

    :where(mn-prose, mn-prose > section) > :where(p),
    :where(mn-prose, mn-prose > section) > :where(ul, ol) > :where(li) {
      line-height: var(--leading-prose);
      overflow-wrap: anywhere;
    }

    :where(mn-prose, mn-prose > section) > :where(ul, ol) > :where(li + li) {
      margin-top: var(--space-3);
    }

    :where(mn-prose, mn-prose > section) > :where(p[mn-lead]) {
      color: var(--text-secondary);
      font-size: var(--text-lg);
      line-height: var(--leading-relaxed);
    }

    :where(mn-prose, mn-prose > section) > :where(p[mn-checked]) {
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    :where(mn-prose) :where(a:not([class])) {
      color: var(--action-primary);
      text-underline-offset: 0.15em;
    }

    /* An identifier the learner has to copy exactly, spelling and case included. */
    :where(mn-prose) :where(code) {
      padding: 0.1em 0.25em;
      border-radius: var(--radius-token);
      background: var(--surface-sunken);
      font-family: var(--font-mono);
      font-size: var(--text-sm);
      overflow-wrap: anywhere;
    }
  `,
})
export class ProseComponent {}
