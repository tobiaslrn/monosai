import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HelpArticleComponent } from '../help-article.component';

@Component({
  selector: 'mn-help-install',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HelpArticleComponent],
  template: `
    <mn-help-article slug="install">
      <p mn-lead>
        Monosai is a website you can install like an app. Everything works in a browser tab, and
        once you've opened it online, most of it works offline too.
      </p>

      <section aria-labelledby="install-how">
        <h2 id="install-how">Install Monosai</h2>
        <p>
          An installed Monosai opens in its own window, without the browser's address bar. On
          Android, it can also receive an Anki package that you share from AnkiDroid.
        </p>
        <h3>On a computer</h3>
        <p>
          In Chrome, select the install icon in the address bar. Or, in
          <a routerLink="/settings">Settings</a>, under <strong>About</strong>, select
          <strong>Install Monosai</strong>. That row appears only while Chrome offers to install
          Monosai.
        </p>
        <h3>On an Android phone</h3>
        <p>
          In Chrome, open the menu and select <strong>Install app</strong> or
          <strong>Add to home screen</strong>. You can also select <strong>Install Monosai</strong>
          in Settings, as on a computer.
        </p>
        <h3>On iPhone or iPad</h3>
        <p>
          In Safari, tap the <strong>Share</strong> button, then
          <strong>Add to Home Screen</strong>. Monosai isn't tested on iPhone and iPad, so some
          things may not work as this guide describes.
        </p>
      </section>

      <section aria-labelledby="install-offline">
        <h2 id="install-offline">Use Monosai offline</h2>
        <p>
          Open Monosai once while you're online, so it can download the Japanese dictionary. After
          that, you can do all of this without a connection:
        </p>
        <ul>
          <li>Read your stories.</li>
          <li>Look up words.</li>
          <li>Play audio you've already generated.</li>
          <li>Paste new Japanese text.</li>
          <li>Refresh your words from Anki or Monosai Bridge on the same device.</li>
          <li>Import an Anki package, once you've imported one while online.</li>
        </ul>
        <p>
          Writing stories, and adding translations, grammar notes or audio, need a connection
          because they use OpenRouter.
        </p>
      </section>

      <section aria-labelledby="install-updates">
        <h2 id="install-updates">Update Monosai</h2>
        <p>
          Monosai checks for updates on its own. When one is ready, a banner says
          <strong>Update ready</strong>. Select <strong>Reload to update</strong>, or
          <strong>Later</strong> to finish what you're doing first. To check straight away, in
          <a routerLink="/settings">Settings</a>, under <strong>About</strong>, select
          <strong>Check for updates</strong>.
        </p>
      </section>

      <section aria-labelledby="install-browsers">
        <h2 id="install-browsers">Which browsers work</h2>
        <p>
          Monosai is tested in Chrome on Windows and on Android 12 or later. Other browsers may
          work, but they aren't tested.
        </p>
      </section>
    </mn-help-article>
  `,
})
export class InstallPageComponent {}
