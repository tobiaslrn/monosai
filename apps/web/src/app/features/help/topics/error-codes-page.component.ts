import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HelpArticleComponent } from '../help-article.component';
import { ERROR_CODE_GROUPS, PLATFORM_CONDITIONS } from './error-codes';

@Component({
  selector: 'mn-help-error-codes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HelpArticleComponent],
  template: `
    <mn-help-article slug="error-codes">
      <p class="mn-prose__lead">
        A failure screen shows a code such as <code>ai/authentication</code>. Look it up here for
        the cause and the next step.
      </p>

      <section aria-labelledby="codes-safe">
        <h2 id="codes-safe">Nothing you have is lost</h2>
        <p>
          A model test and a failed generation write nothing at all. Translation, notes, and audio
          fill a story in order, so a failure part way through leaves the sentences it finished and
          you can ask for the rest again.
        </p>
      </section>

      @for (group of groups; track group.id) {
        <section [attr.aria-labelledby]="'codes-' + group.id">
          <h2 [id]="'codes-' + group.id">{{ group.title }}</h2>
          <p>{{ group.lead }}</p>
          <ul>
            @for (entry of group.entries; track entry.code) {
              <li>
                <code>{{ entry.code }}</code
                >: {{ entry.cause }} {{ entry.fix }}
              </li>
            }
          </ul>
        </section>
      }

      <section aria-labelledby="codes-other">
        <h2 id="codes-other">Problems without a code</h2>
        <ul>
          @for (condition of conditions; track condition.id) {
            <li>
              <strong>{{ condition.symptom }}</strong> {{ condition.explanation }}
            </li>
          }
        </ul>
      </section>

      <section aria-labelledby="codes-unexpected">
        <h2 id="codes-unexpected">unexpected/unexpected</h2>
        <p>
          A failure that none of the groups above recognised. It is worth reporting with the copied
          diagnostics, because an unrecognised failure is a gap in Monosai rather than a condition
          with a known fix.
        </p>
      </section>

      <section aria-labelledby="codes-diagnostics">
        <h2 id="codes-diagnostics">Diagnostics</h2>
        <p>
          Under About in <a routerLink="/settings">Settings</a>, Copy diagnostics copies a redacted
          log of what failed and when, kept only for this tab. Reloading the page clears it, and
          nothing is uploaded. It holds the task, model ID, status, retry count, build version, and
          error code, and never a key, a prompt, a provider reply, your words, or any of your text.
        </p>
        <p>
          When you report a problem on
          <a
            href="https://github.com/tobiaslrn/monosai/issues"
            target="_blank"
            rel="noopener noreferrer"
            >GitHub</a
          >, include the code from the screen and the copied diagnostics.
        </p>
      </section>
    </mn-help-article>
  `,
})
export class ErrorCodesPageComponent {
  protected readonly groups = ERROR_CODE_GROUPS;
  protected readonly conditions = PLATFORM_CONDITIONS;
}
