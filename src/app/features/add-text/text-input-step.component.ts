import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
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
        [attr.aria-invalid]="store.rejection() !== null || isOverLimit() ? 'true' : null"
        [attr.aria-describedby]="
          isOverLimit() ? 'mn-import-count mn-import-limit-hint' : 'mn-import-count'
        "
        [value]="store.rawText()"
        (input)="onPaste($event)"
      ></textarea>
      <p id="mn-import-count" class="count" [class.is-over]="isOverLimit()">
        {{ store.characterCount().toLocaleString('en') }} of
        {{ limit.toLocaleString('en') }} characters
      </p>
      @if (isOverLimit()) {
        <p id="mn-import-limit-hint" class="limit-hint" role="alert">{{ overLimitMessage() }}</p>
      }
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

    .limit-hint {
      margin: calc(var(--space-1) * -1) 0 0;
      color: var(--status-danger);
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
  protected readonly overLimitMessage = computed(() => {
    const excess = this.store.characterCount() - this.limit;
    return `Remove ${String(excess)} ${excess === 1 ? 'character' : 'characters'} to continue.`;
  });

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
