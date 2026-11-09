import { ChangeDetectionStrategy, Component } from '@angular/core';
import { navigationOriginState } from '../../core/routing/navigation-history.service';
import { formatCount } from '../../domain/shared/locale';
import { GENERATION_SNAPSHOT_MINIMUM } from '../../domain/vocabulary/snapshot';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { RowComponent } from '../../shared-ui/row/row.component';
import { SectionComponent } from '../../shared-ui/section/section.component';

/**
 * The Library before there is anything on it.
 *
 * This is the screen a stranger lands on at the public address, so it has to
 * say what Monosai is rather than only offering two buttons. An empty surface
 * has nothing but words to work with, which is the one place the prose budget
 * stretches — and the one surface where the fact that a person made this is
 * allowed to show.
 *
 * Word sources come first, with Anki the first suggested source. The shelf's
 * New story action stays above this empty body, so setup never hides writing.
 *
 * It ends the moment the library has a reading in it.
 */
@Component({
  selector: 'mn-library-welcome',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, RowComponent, SectionComponent],
  template: `
    <!-- One grouped card, like every other list of destinations in Monosai. -->
    <mn-section heading="Monosai writes Japanese you can actually read." [rows]="true">
      <p mn-section-lead>
        Monosai builds readable stories from at least {{ minimumWords }} words from Anki, an Anki
        package, or a pasted list. Paste Japanese text to add readings, spacing, and a dictionary.
      </p>
      <p mn-section-lead>Everything stays on this device.</p>
      <mn-row
        heading="Add a word list"
        icon="vocabulary"
        link="/reading-level"
        fragment="words"
        [state]="libraryOriginState"
        testId="welcome-choice"
      >
        <mn-icon name="chevron-right" [size]="18" />
      </mn-row>
      <mn-row
        heading="Paste Japanese text"
        icon="add"
        link="/add"
        [state]="libraryOriginState"
        testId="welcome-choice"
      >
        <mn-icon name="chevron-right" [size]="18" />
      </mn-row>
    </mn-section>
  `,
})
export class LibraryWelcomeComponent {
  protected readonly libraryOriginState = navigationOriginState('/library');
  /** The generation floor, said once here and defined once in the domain. */
  protected readonly minimumWords = formatCount(GENERATION_SNAPSHOT_MINIMUM);
}
