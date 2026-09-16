import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { HelpIntroService } from './help-intro.service';

/**
 * The one-time offer of the guide, on the screen Monosai opens on.
 *
 * It says what it is offering. It shipped for a while as two unlabelled
 * buttons — "Got it" about nothing — because the sentence between them was
 * dropped and only its stylesheet rule was left behind.
 *
 * It belongs to the Library rather than the shell. Above the shell's outlet it
 * pushed every page's top bar off the viewport edge and reappeared on every
 * non-reader route until it was dismissed; here it sits inside the page column
 * under the Library's own bar, on the surface every other screen leads back to.
 * Making the offer is part of rendering it, so nothing spends the one offer on
 * a screen that cannot show it.
 */
@Component({
  selector: 'mn-help-intro-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    @if (intro.visible()) {
      <aside class="mn-notice intro" aria-label="A little help getting started">
        <mn-icon name="help" [size]="18" />
        <p>New here? The guide covers setup in about a minute.</p>
        <button type="button" class="mn-button" (click)="intro.finish('guide')">
          Read the guide
        </button>
        <button type="button" class="mn-button mn-button--ghost" (click)="intro.finish('dismiss')">
          Got it
        </button>
      </aside>
    }

    @if (intro.saveFailed()) {
      <div class="mn-notice mn-notice--error" role="alert">
        <p>Could not save your Help preference.</p>
        <button type="button" class="mn-button" (click)="intro.retrySave()">Try again</button>
      </div>
    }
  `,
  styles: `
    /* No box of its own: the notices are rows of the page column. */
    :host {
      display: contents;
    }

    /*
     * A notice pushes its single action to the end of the row with an auto
     * margin. Two of them split the free space between them, and once they wrap
     * onto their own line the pair floats away from the text it belongs to. The
     * sentence already takes the row, so the pair needs no push: it sits at the
     * end on a wide screen and under the sentence on a narrow one.
     */
    .intro > .mn-button {
      margin-inline-start: 0;
    }
  `,
})
export class HelpIntroBannerComponent {
  protected readonly intro = inject(HelpIntroService);

  constructor() {
    this.intro.offer();
  }
}
