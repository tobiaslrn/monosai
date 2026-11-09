import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * The opening of the home screen: a line of text beside an illustration, drawn
 * as one composition.
 *
 *   <mn-hero lightSrc="assets/home-reader.png" darkSrc="assets/home-reader-dark.png"
 *            [artWidth]="1254" [artHeight]="1070" [compact]="hasShelf">
 *     <mn-library-standing />
 *   </mn-hero>
 *
 * Each part sits on the other's axis: the text is centred in the hero and the
 * picture is centred in it too, rather than both hanging from the top edge and
 * drifting apart as the text grows a line.
 *
 * The hero hugs the illustration: its heights are the art's width in the art's
 * own proportion, so the distance to the bar above is the page rail and nothing
 * else. Art files are cropped to the drawing for the same reason; empty space
 * in the file reads as spacing no rule can reach.
 *
 * `compact` steps it back once there is something below to come up the
 * screen. The art keeps its proportions; only its size changes.
 */
@Component({
  selector: 'mn-hero',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.is-compact]': 'compact()' },
  template: `
    <div class="hero-text"><ng-content /></div>
    <div class="hero-art" aria-hidden="true" [style.aspect-ratio]="aspectRatio()">
      <img
        class="hero-art-light"
        [src]="lightSrc()"
        alt=""
        [attr.width]="artWidth()"
        [attr.height]="artHeight()"
      />
      <img
        class="hero-art-dark"
        [src]="darkSrc()"
        alt=""
        [attr.width]="artWidth()"
        [attr.height]="artHeight()"
      />
    </div>
  `,
  styles: `
    /*
     * Two columns on one axis: the words take what the picture leaves, and
     * both are centred on the row, so the hero is exactly as tall as the
     * taller of the two and the page's gap is the only space around it.
     */
    :host {
      --hero-art-max: 16rem;

      display: grid;
      grid-template-columns: minmax(0, 1fr) min(45%, var(--hero-art-max));
      gap: var(--stack-gap);
      align-items: center;
    }

    :host(.is-compact) {
      --hero-art-max: 9rem;
    }

    .hero-text {
      min-width: 0;
    }

    .hero-art {
      position: relative;
      width: 100%;
      overflow: hidden;
      pointer-events: none;
    }

    .hero-art img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .hero-art-dark {
      display: none;
    }

    :host-context(html[data-theme='dark']) .hero-art-light {
      display: none;
    }

    :host-context(html[data-theme='dark']) .hero-art-dark {
      display: block;
    }

    @media (prefers-color-scheme: dark) {
      :host-context(html:not([data-theme='light'])) .hero-art-light {
        display: none;
      }

      :host-context(html:not([data-theme='light'])) .hero-art-dark {
        display: block;
      }
    }
  `,
})
export class HeroComponent {
  readonly lightSrc = input.required<string>();
  readonly darkSrc = input.required<string>();
  /** The art's intrinsic size, which reserves its box before the file arrives. */
  readonly artWidth = input.required<number>();
  readonly artHeight = input.required<number>();
  readonly compact = input(false);

  protected readonly aspectRatio = computed(
    () => `${String(this.artWidth())} / ${String(this.artHeight())}`,
  );
}
