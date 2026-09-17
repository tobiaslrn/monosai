import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HelpArticleComponent } from '../help-article.component';

@Component({
  selector: 'mn-help-install',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HelpArticleComponent],
  template: `
    <mn-help-article slug="install">
      <p class="mn-prose__lead">
        Monosai is a web page that can be installed like an app. There is no store listing and no
        download, and the installed version is the same application as the one in the tab.
      </p>

      <section aria-labelledby="install-choice">
        <h2 id="install-choice">In a tab, or installed</h2>
        <p>
          Everything works in an ordinary browser tab, so you can try Monosai without installing
          anything. Installing changes how it feels rather than what it does: its own window, its
          own icon, no address bar, and no chance of closing it while tidying up tabs.
        </p>
        <p>
          On Android the difference is worth having. Installed, Monosai behaves like a normal app on
          the home screen and in the app switcher, and it can receive an Anki export shared from
          AnkiDroid, which a tab cannot.
        </p>
      </section>

      <section aria-labelledby="install-how">
        <h2 id="install-how">Installing</h2>
        <p>
          In Chrome, an install icon appears in the address bar once the page qualifies, and the
          browser menu has the same entry. <a routerLink="/settings">Settings</a> shows an Install
          Monosai button under About, which opens the same prompt. Accept it and Monosai opens in
          its own window from then on.
        </p>
        <p>
          Monosai is built and tested for Chrome on a computer and on Android 12 or newer. Other
          browsers are untested rather than blocked.
        </p>
      </section>

      <section aria-labelledby="install-offline">
        <h2 id="install-offline">What works offline</h2>
        <p>
          Open Monosai online once so the application and the Japanese language data are stored on
          your device. After that, on a train or a plane, you can:
        </p>
        <ul>
          <li>open your library and read any story in it, with readings, spacing, and markers;</li>
          <li>look words up in the dictionary;</li>
          <li>play audio and read translations that were prepared earlier;</li>
          <li>paste new Japanese text and read it, since the analysis runs on your device;</li>
          <li>open an Anki package file to update your words.</li>
        </ul>
        <p>
          What needs a connection is anything that leaves the device: generating a story, a new
          translation, new grammar notes, new audio, and refreshing your words from a running Anki.
          Monosai says so rather than failing quietly.
        </p>
      </section>

      <section aria-labelledby="install-data">
        <h2 id="install-data">Where your data lives</h2>
        <p>
          On this device, in this browser. Your stories, your words, your settings, and your audio
          are stored locally, and there is no account and no server to sync with. Using Monosai on a
          second device means setting it up there too.
        </p>
        <p>
          Your OpenRouter key is kept in this browser's storage and is sent to OpenRouter and
          nowhere else. It never appears in a log, a diagnostic copy, or an error report. What does
          leave your device is what a request needs: your premise, the words you know, and the
          sentence being translated or spoken. If a text is private, do not ask for AI aids on it.
        </p>
        <p>
          Monosai collects no analytics and sends nothing anywhere else. The diagnostics buffer in
          Settings is for you to copy into a bug report, and it is not uploaded.
        </p>
      </section>

      <section aria-labelledby="install-storage">
        <h2 id="install-storage">Storage and starting over</h2>
        <p>
          Settings, under Storage, shows how much space Monosai uses and whether the browser has
          promised to keep the data when the device runs low. You can ask for that promise there,
          and you can delete saved audio separately when it grows.
        </p>
        <p>
          The same section can delete everything local: stories, words, settings, and cached audio.
          It asks twice, it cannot be undone, and it has no effect on your Anki collection.
        </p>
      </section>

      <section aria-labelledby="install-updates">
        <h2 id="install-updates">Updates</h2>
        <p>
          Monosai updates itself. When a new version has downloaded, a banner offers to reload into
          it, and it waits rather than interrupting an import or a running generation. Settings can
          also check on demand.
        </p>
      </section>
    </mn-help-article>
  `,
})
export class InstallPageComponent {}
