import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ImportStore } from '../../application/reading/import.store';
import { MAXIMUM_IMPORT_CHARACTERS } from '../../domain/reading/import-text';

/**
 * Step 1 of Add text: paste Japanese text.
 */
@Component({
  selector: 'mn-text-input-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div role="tabpanel" id="mn-panel-paste" class="mn-field">
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

    .mn-error {
      margin: 0;
      color: var(--status-danger);
    }
  `,
})
export class TextInputStepComponent {
  protected readonly store = inject(ImportStore);
  protected readonly limit = MAXIMUM_IMPORT_CHARACTERS;

  protected isOverLimit(): boolean {
    return this.store.characterCount() > MAXIMUM_IMPORT_CHARACTERS;
  }

  protected onPaste(event: Event): void {
    this.store.setPastedText((event.target as HTMLTextAreaElement).value);
  }

  protected onTitle(event: Event): void {
    this.store.setTitle((event.target as HTMLInputElement).value);
  }
}
