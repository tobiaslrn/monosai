import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * The reader at the desk, in whichever theme is on.
 *
 * Its own component because two surfaces show it — the standing hero once
 * there is a shelf, and the welcome before there is one — and the pair of
 * sources and the theme rules that choose between them should be stated once.
 *
 * It draws inside whatever box it is given and keeps the drawing's proportion.
 * Decoration only: it carries no alternative text and is hidden from assistive
 * technology, because everything it depicts is said in words beside it.
 */
@Component({
  selector: 'mn-home-art',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `
    <img class="light" src="assets/home-reader.png" alt="" width="1254" height="1070" />
    <img class="dark" src="assets/home-reader-dark.png" alt="" width="1254" height="1070" />
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      aspect-ratio: 1254 / 1070;
      overflow: hidden;
      pointer-events: none;
    }

    img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .dark {
      display: none;
    }

    :host-context(html[data-theme='dark']) .light {
      display: none;
    }

    :host-context(html[data-theme='dark']) .dark {
      display: block;
    }

    @media (prefers-color-scheme: dark) {
      :host-context(html:not([data-theme='light'])) .light {
        display: none;
      }

      :host-context(html:not([data-theme='light'])) .dark {
        display: block;
      }
    }
  `,
})
export class HomeArtComponent {}
