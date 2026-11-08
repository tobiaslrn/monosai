import { ChangeDetectionStrategy, Component } from '@angular/core';
import { navigationOriginState } from '../../core/routing/navigation-history.service';
import { formatCount } from '../../domain/shared/locale';
import { GENERATION_SNAPSHOT_MINIMUM } from '../../domain/vocabulary/snapshot';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { StackComponent } from '../../shared-ui/layout/layout';
import { ProseComponent } from '../../shared-ui/prose/prose.component';
import { RowComponent } from '../../shared-ui/row/row.component';

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
  imports: [IconComponent, ProseComponent, RowComponent, StackComponent],
  template: `
    <section aria-labelledby="mn-welcome-heading">
      <mn-stack [gap]="4">
        <mn-prose>
          <h2 id="mn-welcome-heading">Monosai writes Japanese you can actually read.</h2>
          <p mn-lead>
            Monosai builds readable stories from at least {{ minimumWords }} words from Anki, an
            Anki package, or a pasted list. Paste Japanese text to add readings, spacing, and a
            dictionary.
          </p>
          <p>Everything stays on this device.</p>
        </mn-prose>

        <mn-stack [gap]="2">
          <mn-row
            surface="card"
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
            surface="card"
            heading="Paste Japanese text"
            icon="add"
            link="/add"
            [state]="libraryOriginState"
            testId="welcome-choice"
          >
            <mn-icon name="chevron-right" [size]="18" />
          </mn-row>
        </mn-stack>
      </mn-stack>
    </section>
  `,
})
export class LibraryWelcomeComponent {
  protected readonly libraryOriginState = navigationOriginState('/library');
  /** The generation floor, said once here and defined once in the domain. */
  protected readonly minimumWords = formatCount(GENERATION_SNAPSHOT_MINIMUM);
}
