import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  ANKI_PROVIDER_FACTORY,
  PACKAGE_PROVIDER_FACTORY,
} from '../../application/shared/anki-tokens';
import { VocabularyRefreshStore } from '../../application/vocabulary/vocabulary-refresh.store';
import { IconComponent } from '../../shared-ui/icon/icon.component';

/**
 * Choosing where reviewed vocabulary comes from.
 *
 * Both paths are presented as equally legitimate. The package path is the
 * fallback in the sense that it always works, including when the browser will
 * not allow a local connection at all, so it is never framed as a lesser
 * option.
 */
@Component({
  selector: 'mn-provider-selection',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="providers">
      <article class="provider">
        <h3>Local Anki connection</h3>
        <p class="mn-hint">
          Reads directly from Anki while it is running on this device, through AnkiConnect on a
          computer or a compatible bridge on Android. Monosai only ever reads.
        </p>
        <div class="actions">
          <button
            type="button"
            class="mn-button"
            [disabled]="refresh.isBusy()"
            (click)="connectDesktop()"
            data-testid="connect-desktop"
          >
            Test desktop connection
          </button>
          <button
            type="button"
            class="mn-button"
            [disabled]="refresh.isBusy()"
            (click)="connectAndroid()"
            data-testid="connect-android"
          >
            Test Android bridge
          </button>
        </div>
      </article>

      <article class="provider">
        <h3>Anki package</h3>
        <p class="mn-hint">
          Reads an <code>.apkg</code> or <code>.colpkg</code> you export from Anki. The file is
          processed entirely on this device and is never uploaded.
        </p>
        <div class="actions">
          <label class="mn-button file">
            <mn-icon name="upload" />
            Choose a package
            <input
              type="file"
              accept=".apkg,.colpkg"
              [disabled]="refresh.isBusy()"
              (change)="choosePackage($event)"
              data-testid="package-input"
            />
          </label>
          @if (fileName(); as name) {
            <span class="file-name">{{ name }}</span>
          }
        </div>
      </article>
    </div>
  `,
  styles: `
    .providers {
      display: grid;
      gap: var(--space-3);
    }

    @media (min-width: 720px) {
      .providers {
        grid-template-columns: 1fr 1fr;
      }
    }

    .provider {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      padding: var(--space-3);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-card);
    }

    .provider h3 {
      margin: 0;
      font-size: var(--text-md);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      align-items: center;
      margin-top: auto;
    }

    /* The input is visually replaced by its label, which stays keyboard
       reachable because the input keeps its focus ring. */
    .file {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      cursor: pointer;
    }

    .file input {
      position: absolute;
      inset: 0;
      opacity: 0;
      cursor: pointer;
    }

    .file:focus-within {
      outline: var(--focus-ring);
      outline-offset: 2px;
    }

    .file-name {
      font-size: var(--text-sm);
      color: var(--text-secondary);
    }
  `,
})
export class ProviderSelectionComponent {
  protected readonly refresh = inject(VocabularyRefreshStore);
  private readonly createConnection = inject(ANKI_PROVIDER_FACTORY);
  private readonly createPackage = inject(PACKAGE_PROVIDER_FACTORY);

  private readonly fileNameSignal = signal<string | null>(null);
  protected readonly fileName = this.fileNameSignal.asReadonly();

  protected connectDesktop(): void {
    this.fileNameSignal.set(null);
    void this.refresh.connect(this.createConnection('desktop-connect'));
  }

  protected connectAndroid(): void {
    this.fileNameSignal.set(null);
    void this.refresh.connect(this.createConnection('android-connect'));
  }

  protected choosePackage(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0);
    if (file === null || file === undefined) {
      return;
    }
    this.fileNameSignal.set(file.name);
    void this.refresh.connect(
      this.createPackage({ fileName: file.name, bytes: () => file.arrayBuffer() }),
    );
  }
}
