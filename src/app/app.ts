import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AppInitializerService } from './core/bootstrap/app-initializer.service';
import { AppShellComponent } from './core/layout/app-shell.component';
import { ErrorScreenComponent } from './shared-ui/error-screen/error-screen.component';
import { technicalCode } from './domain/shared/errors';

@Component({
  selector: 'mn-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppShellComponent, ErrorScreenComponent],
  template: `
    @let state = initializer.state();

    @if (state.status === 'initializing') {
      <p class="boot" role="status">Starting Monosai…</p>
    } @else if (state.status === 'failed') {
      <mn-error-screen
        heading="Monosai could not start"
        [description]="state.failure.error.message"
        dataStatus="Your saved readings have not been changed."
        [code]="technicalCode(state.failure.error)"
      >
        <button data-actions type="button" class="mn-button mn-button--primary" (click)="retry()">
          Try again
        </button>
      </mn-error-screen>
    } @else {
      <mn-app-shell />
    }
  `,
  styles: `
    .boot {
      padding: var(--space-6);
      color: var(--text-secondary);
      text-align: center;
    }
  `,
})
export class App {
  protected readonly initializer = inject(AppInitializerService);
  protected readonly technicalCode = technicalCode;

  protected retry(): void {
    void this.initializer.run();
  }
}
