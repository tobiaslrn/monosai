import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NoticeComponent } from '../../../shared-ui/notice/notice.component';
import { HelpArticleComponent } from '../help-article.component';

@Component({
  selector: 'mn-help-install',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NoticeComponent, HelpArticleComponent],
  template: `
    <mn-help-article slug="install">
      <p mn-lead>Monosai is a web page you can install like an app.</p>

      <section aria-labelledby="install-choice">
        <h2 id="install-choice">In a tab or installed</h2>
        <p>
          Everything works in a browser tab. Installing gives it its own window and, on Android,
          lets it receive an Anki export shared from AnkiDroid.
        </p>
      </section>

      <section aria-labelledby="install-how">
        <h2 id="install-how">Installing</h2>
        <p>
          In Chrome, use the install icon in the address bar, or Install Monosai under About in
          <a routerLink="/settings">Settings</a>. Tested on Chrome for Windows and Android 12 or
          newer; other browsers are untested.
        </p>
      </section>

      <section aria-labelledby="install-offline">
        <h2 id="install-offline">What works offline</h2>
        <p>
          Open Monosai online once. After that you can read stories, look words up, play prepared
          audio, paste text and open Anki packages. Generating, new translations, notes and audio,
          and refreshing from a running Anki need a connection.
        </p>
      </section>

      <section aria-labelledby="install-data">
        <h2 id="install-data">Where your data lives</h2>
        <p>
          Stories, words, settings and audio live in this browser. There is no account, sync, backup
          or export.
        </p>
        <mn-notice tone="warning" icon="warning">
          <p>
            Clearing browser data removes your stories. Settings, under Storage, can ask the browser
            to keep it.
          </p>
        </mn-notice>
        <p>
          Your OpenRouter key goes to OpenRouter and nowhere else. AI requests send the plot, your
          words, recent story titles, and the sentence being translated or spoken. No analytics.
        </p>
      </section>

      <section aria-labelledby="install-updates">
        <h2 id="install-updates">Updates</h2>
        <p>Monosai updates itself and offers a reload when ready.</p>
      </section>
    </mn-help-article>
  `,
})
export class InstallPageComponent {}
