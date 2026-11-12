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
      <p mn-lead>
        A failure screen shows a code such as <code>ai/authentication</code>. Look it up here.
      </p>

      <section aria-labelledby="codes-safe">
        <h2 id="codes-safe">Nothing you have is lost</h2>
        <p>
          A model test or failed generation saves nothing. Translation, notes and audio keep the
          sentences they finished.
        </p>
      </section>

      @for (group of groups; track group.id) {
        <section [attr.aria-labelledby]="'codes-' + group.id">
          <h2 [id]="'codes-' + group.id">{{ group.title }}</h2>
          <ul>
            @for (entry of group.entries; track entry.code) {
              <li>
                <code>{{ entry.code }}</code
                >: {{ entry.text }}
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
        <p>Not recognised. Report it with Copy diagnostics.</p>
      </section>

      <section aria-labelledby="codes-diagnostics">
        <h2 id="codes-diagnostics">Diagnostics</h2>
        <p>
          Under About in <a routerLink="/settings">Settings</a>, Copy diagnostics copies a redacted
          log kept for this tab only. It never holds a key, prompt or text. Include it, with the
          code, in a
          <a
            href="https://github.com/tobiaslrn/monosai/issues"
            target="_blank"
            rel="noopener noreferrer"
            >GitHub issue</a
          >.
        </p>
      </section>
    </mn-help-article>
  `,
})
export class ErrorCodesPageComponent {
  protected readonly groups = ERROR_CODE_GROUPS;
  protected readonly conditions = PLATFORM_CONDITIONS;
}
