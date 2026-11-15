import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HelpArticleComponent } from '../help-article.component';
import {
  SILENT_PROBLEMS,
  TROUBLESHOOTING_GROUPS,
  type TroubleshootingEntry,
  type TroubleshootingGroup,
} from './troubleshooting';

/** A run of an entry's text: plain, a control in bold, an identifier, or a link to a topic. */
export type TextPart =
  | { readonly kind: 'text' | 'strong' | 'code'; readonly text: string }
  | { readonly kind: 'link'; readonly text: string; readonly link: string };

const MARK = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((\/help\/[a-z-]+)\)/gu;

/**
 * Splits an entry's text at its marks. A mark left unclosed would silently
 * set the rest of the text in the wrong style, so it is an error instead.
 */
export function textParts(text: string): readonly TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(MARK)) {
    if (match.index > last) parts.push({ kind: 'text', text: text.slice(last, match.index) });
    const [, strong, code, linkText, link] = match;
    if (strong !== undefined) parts.push({ kind: 'strong', text: strong });
    else if (code !== undefined) parts.push({ kind: 'code', text: code });
    else if (linkText !== undefined && link !== undefined)
      parts.push({ kind: 'link', text: linkText, link });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
  const leftover = parts.find((part) => part.kind === 'text' && /\*\*|`|\]\(/u.test(part.text));
  if (leftover) throw new Error(`Unclosed mark in help text: ${text}`);
  return parts;
}

interface ShownEntry {
  readonly seen: readonly string[];
  readonly parts: readonly TextPart[];
  readonly code: string | null;
}

interface ShownGroup {
  readonly id: string;
  readonly title: string;
  readonly intro: readonly TextPart[];
  readonly entries: readonly ShownEntry[];
}

function shownEntry(entry: TroubleshootingEntry): ShownEntry {
  return { seen: entry.seen, parts: textParts(entry.text), code: entry.code ?? null };
}

function shown(group: TroubleshootingGroup): ShownGroup {
  return {
    id: group.id,
    title: group.title,
    intro: textParts(group.intro),
    entries: group.entries.map(shownEntry),
  };
}

@Component({
  selector: 'mn-help-troubleshooting',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, RouterLink, HelpArticleComponent],
  template: `
    <!-- One line on purpose: a line break between the runs would set a space before a comma. -->
    <!-- prettier-ignore -->
    <ng-template #rich let-parts>@for (part of parts; track $index) {@switch (part.kind) {@case ('strong') {<strong>{{ part.text }}</strong>}@case ('code') {<code>{{ part.text }}</code>}@case ('link') {<a [routerLink]="part.link">{{ part.text }}</a>}@default {{{ part.text }}}}}</ng-template>

    <mn-help-article slug="troubleshooting">
      <p mn-lead>
        Find the message you see on the screen and what to do about it. Unless a message says
        otherwise, nothing you've saved has changed.
      </p>

      <section aria-labelledby="trouble-contents">
        <h2 id="trouble-contents">On this page</h2>
        <ul>
          @for (group of groups; track group.id) {
            <li>
              <a routerLink="/help/troubleshooting" [fragment]="'trouble-' + group.id">{{
                group.title
              }}</a>
            </li>
          }
          <li>
            <a routerLink="/help/troubleshooting" fragment="trouble-silent"
              >If there's no message</a
            >
          </li>
          <li>
            <a routerLink="/help/troubleshooting" fragment="trouble-report">Report a problem</a>
          </li>
        </ul>
      </section>

      @for (group of groups; track group.id) {
        <section [attr.aria-labelledby]="'trouble-' + group.id">
          <h2 [id]="'trouble-' + group.id">{{ group.title }}</h2>
          <p><ng-container *ngTemplateOutlet="rich; context: { $implicit: group.intro }" /></p>
          <ul>
            @for (entry of group.entries; track $index) {
              <li>
                @for (heading of entry.seen; track heading; let last = $last) {
                  <strong>{{ heading }}</strong>
                  @if (!last) {
                    or
                  }
                }
                <br />
                <ng-container *ngTemplateOutlet="rich; context: { $implicit: entry.parts }" />
                @if (entry.code) {
                  Code: <code>{{ entry.code }}</code>
                }
              </li>
            }
          </ul>
        </section>
      }

      <section aria-labelledby="trouble-silent">
        <h2 id="trouble-silent">If there's no message</h2>
        <ul>
          @for (entry of silent; track $index) {
            <li>
              <strong>{{ entry.seen[0] }}</strong>
              <br />
              <ng-container *ngTemplateOutlet="rich; context: { $implicit: entry.parts }" />
            </li>
          }
        </ul>
      </section>

      <section aria-labelledby="trouble-report">
        <h2 id="trouble-report">Report a problem</h2>
        <p>
          If something keeps going wrong, report it on GitHub so it can be fixed. You need a GitHub
          account.
        </p>
        <ol>
          <li>
            In <a routerLink="/settings">Settings</a>, under <strong>About</strong>, select
            <strong>Copy diagnostics</strong>.
          </li>
          <li>
            Open a new
            <a
              href="https://github.com/tobiaslrn/monosai/issues"
              target="_blank"
              rel="noopener noreferrer"
              >GitHub issue</a
            >.
          </li>
          <li>Describe what you did and what you saw.</li>
          <li>Paste the diagnostics, then submit the issue.</li>
        </ol>
        <p>
          The diagnostics are a short log of what Monosai did in this tab, including the code of any
          failure. They never contain your key or your text.
        </p>
      </section>
    </mn-help-article>
  `,
})
export class TroubleshootingPageComponent {
  protected readonly groups = TROUBLESHOOTING_GROUPS.map(shown);
  protected readonly silent = SILENT_PROBLEMS.map(shownEntry);
}
