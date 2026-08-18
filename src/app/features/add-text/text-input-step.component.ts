import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ImportStore } from '../../application/reading/import.store';
import { MAXIMUM_IMPORT_CHARACTERS } from '../../domain/reading/import-text';
import { IconComponent } from '../../shared-ui/icon/icon.component';

type InputTab = 'paste' | 'file';

/**
 * Step 1 of Add text: paste or choose a file.
 *
 * The file tab is a plain file input with a visible button. Drag and drop is
 * never the only route to importing a file, and a rejected file leaves any
 * pasted draft exactly as it was.
 */
@Component({
  selector: 'mn-text-input-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="tabs" role="tablist" aria-label="Text source">
      <button
        type="button"
        role="tab"
        id="mn-tab-paste"
        [attr.aria-selected]="tab() === 'paste'"
        aria-controls="mn-panel-paste"
        [class.is-active]="tab() === 'paste'"
        (click)="selectTab('paste')"
      >
        Paste text
      </button>
      <button
        type="button"
        role="tab"
        id="mn-tab-file"
        [attr.aria-selected]="tab() === 'file'"
        aria-controls="mn-panel-file"
        [class.is-active]="tab() === 'file'"
        (click)="selectTab('file')"
      >
        Text file
      </button>
    </div>

    @if (tab() === 'paste') {
      <div role="tabpanel" id="mn-panel-paste" aria-labelledby="mn-tab-paste" class="mn-field">
        <label for="mn-import-text">Japanese text</label>
        <textarea
          id="mn-import-text"
          rows="12"
          lang="ja"
          required
          [attr.aria-invalid]="store.rejection() !== null ? 'true' : null"
          aria-describedby="mn-import-count"
          [value]="store.rawText()"
          (input)="onPaste($event)"
        ></textarea>
        <p id="mn-import-count" class="count" [class.is-over]="isOverLimit()">
          {{ store.characterCount().toLocaleString('en') }} of
          {{ limit.toLocaleString('en') }} characters
        </p>
      </div>
    } @else {
      <div role="tabpanel" id="mn-panel-file" aria-labelledby="mn-tab-file" class="mn-field">
        <label for="mn-import-file">Choose a UTF-8 .txt file</label>
        <input
          id="mn-import-file"
          type="file"
          accept=".txt,text/plain"
          aria-describedby="mn-file-hint"
          (change)="onFile($event)"
        />
        <p id="mn-file-hint" class="mn-hint">
          Only plain UTF-8 text is supported. The file stays on this device.
        </p>
        @if (store.fileName(); as name) {
          <p class="loaded">
            <mn-icon name="check" [size]="18" />
            <span
              >Loaded {{ name }} —
              {{ store.characterCount().toLocaleString('en') }} characters</span
            >
          </p>
        }
      </div>
    }

    @if (store.rejection(); as rejection) {
      <p class="mn-error" role="alert">{{ rejection.message }}</p>
    }

    <div class="mn-field">
      <label for="mn-import-title">Title (optional)</label>
      <input
        id="mn-import-title"
        type="text"
        [value]="store.titleInput()"
        [attr.placeholder]="store.derivedTitle()"
        (input)="onTitle($event)"
      />
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .tabs {
      display: flex;
      gap: var(--space-2);
    }

    .tabs button {
      min-height: var(--touch-target);
      padding: var(--space-2) var(--space-4);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-pill);
      background: var(--surface-raised);
      color: var(--text-primary);
      font: inherit;
      cursor: pointer;
    }

    .tabs button.is-active {
      border-color: transparent;
      background: var(--action-primary);
      color: var(--text-on-action);
    }

    textarea {
      width: 100%;
      font: inherit;
      font-family: var(--font-japanese);
      font-size: var(--text-lg);
      line-height: 1.8;
      resize: vertical;
    }

    .count {
      margin: 0;
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .count.is-over {
      color: var(--status-danger);
      font-weight: 600;
    }

    .loaded {
      display: flex;
      gap: var(--space-2);
      align-items: center;
      margin: 0;
      color: var(--status-success);
      font-size: var(--text-sm);
    }

    .mn-error {
      margin: 0;
      color: var(--status-danger);
    }
  `,
})
export class TextInputStepComponent {
  protected readonly store = inject(ImportStore);
  protected readonly limit = MAXIMUM_IMPORT_CHARACTERS;

  private readonly tabSignal = signal<InputTab>('paste');
  protected readonly tab = this.tabSignal.asReadonly();

  protected isOverLimit(): boolean {
    return this.store.characterCount() > MAXIMUM_IMPORT_CHARACTERS;
  }

  protected selectTab(tab: InputTab): void {
    this.tabSignal.set(tab);
  }

  protected onPaste(event: Event): void {
    this.store.setPastedText((event.target as HTMLTextAreaElement).value);
  }

  protected onTitle(event: Event): void {
    this.store.setTitle((event.target as HTMLInputElement).value);
  }

  protected onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0);
    if (!file) {
      return;
    }
    void file.arrayBuffer().then((bytes) => {
      this.store.loadFile({ name: file.name, bytes });
      // Clearing lets the same file be chosen again after fixing its encoding.
      input.value = '';
    });
  }
}
