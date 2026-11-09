import { Dialog } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { AppUpdateStore } from '../../application/pwa/app-update.store';
import { openConfirmDialog } from '../../shared-ui/confirm-dialog/confirm-dialog.component';
import { BannerComponent } from '../../shared-ui/banner/banner.component';
import { ButtonDirective } from '../../shared-ui/button/button';

/**
 * A non-modal update notice.
 *
 * Deliberately never a dialog: it must not steal focus from a form the
 * learner is in the middle of. While busy work is in progress it says so and
 * disables the action rather than hiding it, so the update stays visible and
 * predictable instead of silently withheld.
 */
@Component({
  selector: 'mn-app-update-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BannerComponent, ButtonDirective],
  template: `
    @let status = store.status();
    @if (
      status.kind === 'superseded' ||
      (!supersededOnly() &&
        (status.kind === 'available' || status.kind === 'activating' || status.kind === 'failed'))
    ) {
      <mn-banner
        class="banner"
        [tone]="status.kind === 'superseded' || status.kind === 'failed' ? 'error' : 'info'"
        [icon]="status.kind === 'superseded' || status.kind === 'failed' ? 'warning' : null"
        [attr.role]="status.kind === 'superseded' ? 'alert' : 'status'"
        [attr.aria-live]="status.kind === 'superseded' ? null : 'polite'"
      >
        @switch (status.kind) {
          @case ('superseded') {
            <p>{{ status.message }}</p>
          }
          @case ('available') {
            <p>A new version of Monosai is ready.</p>
            @if (store.isBusy()) {
              <p class="mn-hint">Waiting for current work to finish.</p>
            }
          }
          @case ('activating') {
            <p>Updating…</p>
          }
          @case ('failed') {
            <p>{{ status.message }}</p>
            @if (store.isBusy()) {
              <p class="mn-hint">Waiting for current work to finish.</p>
            }
          }
        }
        <ng-container ngProjectAs="[mn-banner-action]">
          @switch (status.kind) {
            @case ('superseded') {
              <button mnButton="primary" type="button" (click)="reloadSuperseded()">Reload</button>
            }
            @case ('available') {
              @if (store.isBusy()) {
                <button mnButton="primary" type="button" disabled>Reload to update</button>
              } @else {
                <button mnButton="primary" type="button" (click)="activate()">
                  Reload to update
                </button>
                <button mnButton="ghost" type="button" (click)="dismiss()">Later</button>
              }
            }
            @case ('failed') {
              @if (status.recovery === 'reload') {
                <button mnButton type="button" [disabled]="store.isBusy()" (click)="reload()">
                  Reload to recover
                </button>
              } @else {
                <button mnButton type="button" (click)="retry()">Try again</button>
              }
            }
          }
        </ng-container>
      </mn-banner>
    }
  `,
})
export class AppUpdateBannerComponent {
  protected readonly store = inject(AppUpdateStore);
  private readonly dialog = inject(Dialog);

  /** The reader carries no application chrome, so it shows only a lost database. */
  readonly supersededOnly = input(false);

  /**
   * Saving can never succeed in this tab, so busy work is not worth waiting for; the learner is
   * told what a reload discards and decides.
   */
  protected async reloadSuperseded(): Promise<void> {
    const work = this.store.busyReason();
    if (work !== null) {
      const confirmed = await openConfirmDialog(this.dialog, {
        title: 'Reload and lose unsaved work?',
        message: 'This tab can no longer save, so reloading discards:',
        details: [work.charAt(0).toUpperCase() + work.slice(1)],
        confirmLabel: 'Reload',
        cancelLabel: 'Stay here',
        tone: 'danger',
      });
      if (!confirmed) {
        return;
      }
    }
    this.store.reloadSuperseded();
  }

  protected activate(): void {
    void this.store.activate();
  }

  protected retry(): void {
    void this.store.check();
  }

  protected reload(): void {
    this.store.reloadNow();
  }

  protected dismiss(): void {
    this.store.dismiss();
  }
}
