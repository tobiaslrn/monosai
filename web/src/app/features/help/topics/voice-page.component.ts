import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CardComponent } from '../../../shared-ui/card/card.component';
import { FactsComponent } from '../../../shared-ui/facts/facts.component';
import { StackComponent } from '../../../shared-ui/layout/layout';
import { NoticeComponent } from '../../../shared-ui/notice/notice.component';
import { HelpArticleComponent } from '../help-article.component';

@Component({
  selector: 'mn-help-voice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    CardComponent,
    FactsComponent,
    HelpArticleComponent,
    NoticeComponent,
    StackComponent,
  ],
  template: `
    <mn-help-article slug="voice">
      <p mn-lead>
        The two sensible speech models are nowhere near each other in price, or in how well they
        read Japanese. Here is what you are picking between.
      </p>

      <section aria-labelledby="voice-kinds">
        <h2 id="voice-kinds">Two kinds of speech model</h2>
        <h3>Models that take instructions</h3>
        <p>
          Large language models that happen to output audio. They read a sentence in context, so
          they put the stress in the right place, pause where a comma asks, and match the tone to
          what is happening. They also act on the speaking style you choose in Settings. On Japanese
          the result is close to a native speaker reading aloud.
        </p>
        <h3>Models that only speak</h3>
        <p>
          Small, dedicated text-to-speech models. They are fast and cost almost nothing. The
          intonation is flat in places, a speaking style means nothing to them, and they get some
          readings wrong, as below.
        </p>
      </section>

      <section aria-labelledby="voice-pick">
        <h2 id="voice-pick">What to use</h2>
        <mn-stack [gap]="4">
          <mn-card heading="Kokoro 82M">
            <p><code>hexgrad/kokoro-82m</code></p>
            <mn-facts
              [facts]="[
                { label: 'Price', value: '$0.62/M characters' },
                { label: 'A 50-sentence story', value: 'Well under a cent' },
              ]"
            />
            <p>
              Plainer and less clever, and cheap enough that the cost never comes up. Good enough to
              follow along with, which is most of what audio is for. Gets some readings wrong, as
              below.
            </p>
          </mn-card>
          <mn-card heading="Gemini 3.1 Flash TTS Preview">
            <p><code>google/gemini-3.1-flash-tts-preview</code></p>
            <mn-facts
              [facts]="[
                { label: 'Price', value: '$1/M text tokens in, $20/M audio tokens out' },
                { label: 'A 50-sentence story', value: 'Around 20 cents' },
              ]"
            />
            <p>
              Pauses, intonation, and a speaking style it acts on. Reads kanji by the sentence, so
              it gets the readings right. Daily use runs to a few dollars a month.
            </p>
          </mn-card>
        </mn-stack>
        <p>
          Pick by how you plan to listen. If audio is the point of the session, pay for the
          instruction model. If it is a companion to the text, the small model costs so little you
          can generate audio for every story without thinking about it.
        </p>
        <p mn-checked>Prices and names checked on Sep 17, 2026.</p>
      </section>

      <section aria-labelledby="voice-settings">
        <h2 id="voice-settings">Voice, pace, and style</h2>
        <p>
          Voice settings live under AI in <a routerLink="/settings">Settings</a>. Where OpenRouter
          advertises a model's voices, Monosai offers them as a list instead of asking you to type
          an ID. Pace is Natural, Slow, or Very slow. Speaking style is Natural, Clear, or Very
          clear, and is sent only to models that act on instructions.
        </p>
        <p>
          Audio cannot be generated until you have pressed Preview and it has succeeded. Preview
          plays one test sentence.
        </p>
        <mn-notice tone="warning" icon="warning">
          <p>
            Listen to it before preparing audio for a long story. A speech model can return a clip
            that is empty or undecodable, reported as <code>ai/audio-invalid</code>, and one
            sentence is a cheaper place to find that out.
          </p>
        </mn-notice>
        <p>
          Reading speed during playback is adjusted on your device with the pitch preserved, so
          slowing a story down costs nothing and needs no new request.
        </p>
        <p>
          Changing the model, the voice, or the style does not silence what you have already paid
          for. Those clips keep playing and the player says "Some audio is from older settings"
          until you regenerate the story's audio from Story options.
        </p>
        <p>
          Audio is cached on your device once generated, so replaying a story is free and works
          offline.
        </p>
      </section>

      <section aria-labelledby="voice-readings">
        <h2 id="voice-readings">When a word is read wrong</h2>
        <p>
          A kanji often has several readings, and which one is right depends on the sentence. The
          small speech models do not work that out. They look each word up in a fixed dictionary and
          read whatever it lists first, so a word with more than one reading comes out the same way
          every time, right or wrong.
        </p>
        <p>
          Kokoro reads <span lang="ja">私</span> as <span lang="ja">わたくし</span>, the stiff,
          formal reading, even where anyone would say <span lang="ja">わたし</span>. It does this
          every time, including inside <span lang="ja">私達</span>. Other common words have the same
          problem.
        </p>
        <p>
          Do not learn a reading from the audio alone. Tap the word instead: lookup in the reader
          runs on your device with a dictionary that does read the sentence around it, and it gets
          these right.
        </p>
        <p>
          The instruction-following models handle readings properly, because they understand the
          sentence instead of looking words up one at a time. Pay for one if you are listening to
          learn pronunciation.
        </p>
      </section>
    </mn-help-article>
  `,
})
export class VoicePageComponent {}
