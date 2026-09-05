import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { IconComponent } from '../../shared-ui/icon/icon.component';

/** Shared utility destinations; the shell keeps this off every reader route. */
@Component({
  selector: 'mn-app-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, IconComponent],
  template: `
    <header class="bar">
      <a class="identity" routerLink="/library" aria-label="Monosai library">
        <img class="mark" src="icons/icon-192.png" alt="" width="40" height="40" />
        <span class="wordmark">Monosai</span>
      </a>
      <nav aria-label="Utilities">
        <a
          class="mn-icon-button"
          routerLink="/settings"
          routerLinkActive="current"
          ariaCurrentWhenActive="page"
          aria-label="Settings"
          title="Settings"
        >
          <mn-icon name="settings" />
        </a>
        <a
          class="mn-icon-button"
          routerLink="/help"
          routerLinkActive="current"
          ariaCurrentWhenActive="page"
          aria-label="Help"
          title="Help"
        >
          <mn-icon name="help" />
        </a>
        <a
          class="mn-icon-button"
          href="https://github.com/tobiaslrn/monosai"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub (opens in a new tab)"
          title="GitHub (opens in a new tab)"
        >
          <mn-icon name="github" />
        </a>
      </nav>
    </header>
  `,
  styles: `
    :host {
      display: block;
      padding: var(--space-5) var(--space-4) 0;
    }
    .bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      max-width: var(--layout-measure);
      margin-inline: auto;
    }
    .identity {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      min-width: 0;
      min-height: var(--touch-target);
      color: var(--text-primary);
      text-decoration: none;
      border-radius: var(--radius-control);
      padding: var(--space-1);
    }
    .mark {
      flex: none;
      border-radius: var(--radius-control);
    }
    .wordmark {
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    nav {
      display: flex;
      flex: none;
      gap: var(--space-2);
    }
    .mn-icon-button {
      min-width: var(--touch-target);
      min-height: var(--touch-target);
      background: transparent;
      border-color: transparent;
    }
    .mn-icon-button:hover,
    .current {
      background: var(--surface-sunken);
    }
    @media (max-width: 29.9375em) {
      nav {
        gap: var(--space-3);
      }
      .wordmark {
        display: none;
      }
    }
    @media (min-width: 60em) {
      :host {
        padding: var(--space-6) var(--space-6) 0;
      }
    }
  `,
})
export class AppBarComponent {}
