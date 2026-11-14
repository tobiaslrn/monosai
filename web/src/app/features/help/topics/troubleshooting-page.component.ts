import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HelpArticleComponent } from '../help-article.component';
import {
  SILENT_PROBLEMS,
  TROUBLESHOOTING_GROUPS,
  type TroubleshootingEntry,
  type TroubleshootingGroup,
} from './troubleshooting';

/** A run of text, set in bold where the source wrapped it in `**`. */
interface TextPart {
  readonly text: string;
  readonly strong: boolean;
}

interface ShownEntry {
  readonly seen: readonly string[];
  readonly parts: readonly TextPart[];
  readonly code: string | null;
}

interface ShownGroup {
  readonly id: string;
  readonly title: string;
  readonly intro: string;
  readonly entries: readonly ShownEntry[];
}

function parts(text: string): readonly TextPart[] {
  return text
    .split('**')
    .map((run, index) => ({ text: run, strong: index % 2 === 1 }))
    .filter((part) => part.text.length > 0);
}

function shown(group: TroubleshootingGroup): ShownGroup {
  return {
    id: group.id,
    title: group.title,
    intro: group.intro,
    entries: group.entries.map(shownEntry),
  };
}

function shownEntry(entry: TroubleshootingEntry): ShownEntry {
  return { seen: entry.seen, parts: parts(entry.text), code: entry.code ?? null };
}

@Component({
  selector: 'mn-help-troubleshooting',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HelpArticleComponent],
  template: `
    <mn-help-article slug="troubleshooting">
      <p mn-lead>
        Find the message you see on the screen, and what to do about it. Unless a message says
        otherwise, nothing you've saved has changed.
      </p>

      @for (group of groups; track group.id) {
        <section [attr.aria-labelledby]="'trouble-' + group.id">
          <h2 [id]="'trouble-' + group.id">{{ group.title }}</h2>
          <p>{{ group.intro }}</p>
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
                @for (part of entry.parts; track $index) {
                  @if (part.strong) {
                    <strong>{{ part.text }}</strong>
                  } @else {
                    {{ part.text }}
                  }
                }
                @if (entry.code) {
                  <code>{{ entry.code }}</code>
                }
              </li>
            }
          </ul>
        </section>
      }

      <section aria-labelledby="trouble-silent">
        <h2 id="trouble-silent">Problems without a message</h2>
        <ul>
          @for (entry of silent; track $index) {
            <li>
              <strong>{{ entry.seen[0] }}</strong>
              <br />
              @for (part of entry.parts; track $index) {
                @if (part.strong) {
                  <strong>{{ part.text }}</strong>
                } @else {
                  {{ part.text }}
                }
              }
            </li>
          }
        </ul>
      </section>

      <section aria-labelledby="trouble-report">
        <h2 id="trouble-report">Report a problem</h2>
        <p>If something keeps going wrong, report it so it can be fixed:</p>
        <ol>
          <li>
            Open <a routerLink="/settings">Settings</a> and select
            <strong>Copy diagnostics</strong> under <strong>About</strong>.
          </li>
          <li>
            Open a
            <a
              href="https://github.com/tobiaslrn/monosai/issues"
              target="_blank"
              rel="noopener noreferrer"
              >GitHub issue</a
            >, describe what you did and what you saw, and paste the diagnostics.
          </li>
        </ol>
        <p>
          The diagnostics are a short log of what Monosai did in this tab, with codes like the ones
          below. They never contain your key or your text.
        </p>
      </section>
    </mn-help-article>
  `,
})
export class TroubleshootingPageComponent {
  protected readonly groups = TROUBLESHOOTING_GROUPS.map(shown);
  protected readonly silent = SILENT_PROBLEMS.map(shownEntry);
}
