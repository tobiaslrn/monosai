import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { navigationOriginState } from '../../core/routing/navigation-history.service';
import { IconComponent } from '../../shared-ui/icon/icon.component';

/**
 * The two ways a reading gets into the library.
 *
 * Generating is a branch of adding rather than a destination of its own: it
 * produces the same thing by a different route, and giving it equal billing in
 * a navigation bar was what made Monosai look like an AI tool with a reader
 * attached.
 */
@Component({
  selector: 'mn-new-reading-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent],
  template: `
    <div class="choices">
      <a routerLink="/add" [state]="libraryOriginState" (click)="chosen.emit()">
        <mn-icon name="add" [size]="20" />
        <span>Paste text</span>
      </a>
      <a routerLink="/generate" [state]="libraryOriginState" (click)="chosen.emit()">
        <mn-icon name="generate" [size]="20" />
        <span>Write with AI</span>
      </a>
    </div>
  `,
  styles: `
    .choices {
      display: flex;
      flex-direction: column;
    }

    a {
      display: flex;
      gap: var(--space-3);
      align-items: center;
      min-height: var(--touch-target);
      padding: var(--space-3);
      border-radius: var(--radius-control);
      color: var(--text-primary);
      text-decoration: none;
    }

    a:hover {
      background: var(--surface-sunken);
    }
  `,
})
export class NewReadingMenuComponent {
  protected readonly libraryOriginState = navigationOriginState('/library');
  /** Emitted so the surface holding this menu can close itself. */
  readonly chosen = output<void>();
}
