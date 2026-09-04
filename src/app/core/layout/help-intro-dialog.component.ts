import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DialogRef } from '@angular/cdk/dialog';

@Component({
  selector: 'mn-help-intro-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="intro">
      <h2 id="mn-help-intro-title">A little help getting started</h2>
      <p id="mn-help-intro-description">
        Read Japanese you bring yourself, or make stories from your Anki vocabulary. The guide
        explains where to start and how to use reading aids.
      </p>
      <p>You can always open Help from the top bar.</p>
      <div class="actions">
        <button type="button" class="mn-button" (click)="close('dismiss')">Got it</button>
        <button type="button" class="mn-button mn-button--primary" (click)="close('guide')">
          Read the guide
        </button>
      </div>
    </div>
  `,
  styles: `
    .intro {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      width: min(28rem, calc(100vw - 2 * var(--space-4)));
      max-height: calc(100dvh - 2 * var(--space-4));
      overflow-y: auto;
      padding: var(--space-5);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-card);
      background: var(--surface-panel);
      box-shadow: var(--shadow-overlay);
    }
    h2 {
      margin: 0;
      font-size: 1.25rem;
    }
    p {
      margin: 0;
      color: var(--text-secondary);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--space-2);
      margin-top: var(--space-2);
    }
  `,
})
export class HelpIntroDialogComponent {
  private readonly ref = inject<DialogRef<'guide' | 'dismiss'>>(DialogRef);
  protected close(result: 'guide' | 'dismiss'): void {
    this.ref.close(result);
  }
}
