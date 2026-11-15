import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CardComponent } from '../../../shared-ui/card/card.component';
import { FactsComponent } from '../../../shared-ui/facts/facts.component';
import { StackComponent } from '../../../shared-ui/layout/layout';
import { HelpArticleComponent } from '../help-article.component';

@Component({
  selector: 'mn-help-voice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, CardComponent, FactsComponent, HelpArticleComponent, StackComponent],
  template: `
    <mn-help-article slug="voice">
      <p mn-lead>
        Monosai can read your stories aloud with an AI speech model. Set it up once, and every story
        can have audio.
      </p>

      <section aria-labelledby="voice-setup">
        <h2 id="voice-setup">Set up a voice</h2>
        <p>
          You need an OpenRouter key first, as
          <a routerLink="/help/get-started">Get started</a> describes.
        </p>
        <ol>
          <li>Open <a routerLink="/settings/voice">Settings > Voice</a>.</li>
          <li>Select <strong>Model</strong>, and choose a speech model.</li>
          <li>Choose a <strong>Voice</strong>, or enter its name if the model has no list.</li>
          <li>Choose a <strong>Pace</strong>.</li>
          <li>Optional: if <strong>Speaking style</strong> appears, choose one.</li>
          <li>Select <strong>Play sample</strong>.</li>
        </ol>
        <p>
          When the sample plays, the status says <strong>Ready</strong>, and the player in the
          reader can generate audio. Until a sample has played, audio stays off, because the sample
          is how Monosai checks that the voice works.
        </p>
      </section>

      <section aria-labelledby="voice-kinds">
        <h2 id="voice-kinds">Two kinds of speech model</h2>
        <p>
          <em>Instruction models</em> read the whole sentence and follow the pace and speaking style
          you choose, so they sound close to a native speaker. <em>Simple speech models</em>
          are fast and very cheap, but they sound flatter and sometimes use the wrong reading for a
          word.
        </p>
      </section>

      <section aria-labelledby="voice-pick">
        <h2 id="voice-pick">Recommended models</h2>
        <mn-stack [gap]="4">
          <mn-card heading="Kokoro 82M">
            <p><code>hexgrad/kokoro-82m</code></p>
            <mn-facts
              [facts]="[
                { label: 'Price', value: '$0.62 per million characters' },
                { label: 'A 50-sentence story', value: 'Well under a cent' },
              ]"
            />
            <p>
              Kokoro is a simple speech model, so cheap that cost never matters. It misreads some
              words.
            </p>
          </mn-card>
          <mn-card heading="Gemini 3.1 Flash TTS Preview">
            <p><code>google/gemini-3.1-flash-tts-preview</code></p>
            <mn-facts
              [facts]="[
                {
                  label: 'Price',
                  value: '$1 per million text tokens in, $20 per million audio tokens out',
                },
                { label: 'A 50-sentence story', value: 'Around 20 cents' },
              ]"
            />
            <p>
              Gemini TTS is an instruction model with natural pauses and intonation, and it reads
              kanji in context. Daily use costs a few dollars a month.
            </p>
          </mn-card>
        </mn-stack>
        <p mn-checked>Prices and names checked on Sep 17, 2026.</p>
      </section>

      <section aria-labelledby="voice-readings">
        <h2 id="voice-readings">If a word sounds wrong</h2>
        <p>
          Simple speech models read each word from a fixed dictionary, so
          <span lang="ja">私</span> is always <span lang="ja">わたくし</span>, even where
          <span lang="ja">わたし</span> is meant. Instruction models get readings like this right
          far more often.
        </p>
        <p>Don't learn readings from the audio alone. Select the word to check its reading.</p>
      </section>

      <section aria-labelledby="voice-change">
        <h2 id="voice-change">Change the voice</h2>
        <p>
          After you change the model, <strong>Voice</strong>, <strong>Pace</strong> or
          <strong>Speaking style</strong>, select <strong>Play sample</strong> again. New audio
          stays off until the sample plays.
        </p>
        <p>
          Audio you've already generated keeps the voice it was made with. To hear a story in the
          new voice, open <strong>Story options</strong>, select <strong>Delete audio…</strong>, and
          generate the audio again from the player.
        </p>
      </section>

      <section aria-labelledby="voice-cost">
        <h2 id="voice-cost">What audio costs</h2>
        <p>
          Generating audio sends a request to OpenRouter for each sentence, and each
          <strong>Play sample</strong> is a small request too. Monosai saves the audio on your
          device, so replaying it is free and works offline, and changing the playback speed costs
          nothing.
        </p>
      </section>
    </mn-help-article>
  `,
})
export class VoicePageComponent {}
