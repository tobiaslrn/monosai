import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppMarkComponent } from '../../../shared-ui/app-mark/app-mark.component';
import { ButtonDirective } from '../../../shared-ui/button/button';
import { CardComponent } from '../../../shared-ui/card/card.component';
import { HeroComponent } from '../../../shared-ui/hero/hero.component';
import { IconComponent } from '../../../shared-ui/icon/icon.component';
import {
  ClusterComponent,
  GridComponent,
  PageComponent,
  StackComponent,
} from '../../../shared-ui/layout/layout';
import { PageHeaderComponent } from '../../../shared-ui/page-header/page-header.component';
import { PagerComponent } from '../../../shared-ui/pager/pager.component';
import { SectionComponent } from '../../../shared-ui/section/section.component';
import { StandingComponent } from '../../../shared-ui/standing/standing.component';

/** The frame of a page: the home bar, the hero and its standing line, the pager, and the layout primitives. */
@Component({
  selector: 'mn-gallery-frame',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppMarkComponent,
    ButtonDirective,
    CardComponent,
    ClusterComponent,
    GridComponent,
    HeroComponent,
    IconComponent,
    PageComponent,
    PageHeaderComponent,
    PagerComponent,
    RouterLink,
    SectionComponent,
    StackComponent,
    StandingComponent,
  ],
  template: `
    <mn-page>
      <mn-page-header heading="Page frame" [home]="true" [showAlpha]="true">
        <nav aria-label="Utilities">
          <mn-cluster [gap]="1">
            <a mnButton="icon" routerLink="/gallery" aria-label="Gallery" title="Gallery">
              <mn-icon name="library" />
            </a>
            <a mnButton="icon" routerLink="/gallery" aria-label="Settings" title="Settings">
              <mn-icon name="settings" />
            </a>
          </mn-cluster>
        </nav>
      </mn-page-header>

      <mn-hero
        role="region"
        aria-label="Hero"
        lightSrc="assets/home-reader.png"
        darkSrc="assets/home-reader-dark.png"
        [artWidth]="1254"
        [artHeight]="1070"
      >
        <mn-standing link="/gallery">
          <span>You know 515 words.</span>
          <span mn-standing-detail>Connect Anki to write stories from your own words.</span>
        </mn-standing>
      </mn-hero>

      <mn-hero
        role="region"
        aria-label="Compact hero"
        lightSrc="assets/home-reader.png"
        darkSrc="assets/home-reader-dark.png"
        [artWidth]="1254"
        [artHeight]="1070"
        [compact]="true"
      >
        <mn-standing [compact]="true">
          <span>Read Japanese with the words you know.</span>
        </mn-standing>
      </mn-hero>

      <mn-section heading="Stack, cluster and grid">
        <mn-stack>
          <mn-cluster>
            <mn-app-mark />
            <mn-app-mark [alpha]="true" />
          </mn-cluster>
          <mn-grid min="9rem">
            <mn-card heading="Words"><p>515</p></mn-card>
            <mn-card heading="Stories"><p>14</p></mn-card>
            <mn-card heading="Read"><p>9</p></mn-card>
          </mn-grid>
        </mn-stack>
      </mn-section>

      <mn-pager
        label="More topics"
        [previous]="{ title: 'Your words', link: '/gallery' }"
        [next]="{ title: 'Reading level', link: '/gallery' }"
      />
      <mn-pager label="Next topic" [next]="{ title: 'Write a story', link: '/gallery' }" />
    </mn-page>
  `,
})
export class GalleryFrameComponent {}
