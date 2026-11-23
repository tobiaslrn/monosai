import { ChangeDetectionStrategy, Component, inject, Injector, input } from '@angular/core';
import { AppUpdateStore } from '../../application/pwa/app-update.store';
import { UnloadedCodeRegistry } from '../../application/shared/unloaded-code.registry';
import { confirmLater } from '../../shared-ui/confirm-dialog/confirm-later';
import { BannerComponent } from '../../shared-ui/banner/banner.component';
import { ButtonDirective } from '../../shared-ui/button/button';

/**
 * A non-modal notice for the states only a reload ends: a broken service worker, a lost database,
 * and speech code this tab could not load. A new version never shows here; the next launch picks
 * it up (ADR 0094).
 *
 * Deliberately never a dialog: it must not steal focus from a form the learner is in the middle
 * of. While busy work is in progress a broken worker's reload says so and is disabled rather
 * than hidden.
 */
@Component({
  selector: 'mn-app-update-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BannerComponent, ButtonDirective],
  template: `
    @let status = store.status();
    @if (status.kind === 'superseded' || (!supersededOnly() && status.kind === 'failed')) {
      <mn-banner
        class="banner"
        tone="danger"
        icon="warning"
        [attr.role]="status.kind === 'superseded' ? 'alert' : 'status'"
        [attr.aria-live]="status.kind === 'superseded' ? null : 'polite'"
      >
        <p>{{ status.message }}</p>
        @if (status.kind === 'failed' && store.isBusy()) {
          <p class="mn-hint">Finishing current work…</p>
        }
        <ng-container ngProjectAs="[mn-banner-action]">
          @if (status.kind === 'superseded') {
            <button mnButton="primary" type="button" (click)="reloadSuperseded()">Reload</button>
          } @else {
            <button mnButton type="button" [disabled]="store.isBusy()" (click)="reload()">
              Reload to recover
            </button>
          }
        </ng-container>
      </mn-banner>
    } @else if (unloadedCode.speech()) {
      <mn-banner class="banner" tone="danger" icon="warning" role="status" aria-live="polite">
        <p>Part of Monosai did not load, so this tab cannot make audio.</p>
        @if (store.isBusy()) {
          <p class="mn-hint">Finishing current work…</p>
        }
        <ng-container ngProjectAs="[mn-banner-action]">
          <button mnButton type="button" [disabled]="store.isBusy()" (click)="reload()">
            Reload to recover
          </button>
        </ng-container>
      </mn-banner>
    }
  `,
})
export class AppUpdateBannerComponent {
  protected readonly store = inject(AppUpdateStore);
  protected readonly unloadedCode = inject(UnloadedCodeRegistry);
  private readonly injector = inject(Injector);

  /**
   * The reader carries no application chrome, so it shows only what concerns it: a lost database,
   * and speech that could not load, which is where audio is made.
   */
  readonly supersededOnly = input(false);

  /**
   * Saving can never succeed in this tab, so busy work is not worth waiting for; the learner is
   * told what a reload discards and decides.
   */
  protected async reloadSuperseded(): Promise<void> {
    const work = this.store.busyReason();
    if (work !== null) {
      const confirmed = await confirmLater(this.injector, {
        title: 'Reload and lose unsaved work?',
        message: 'Reloading discards:',
        details: [work.charAt(0).toUpperCase() + work.slice(1)],
        confirmLabel: 'Reload',
        cancelLabel: 'Cancel',
        tone: 'danger',
      });
      if (!confirmed) {
        return;
      }
    }
    this.store.reloadSuperseded();
  }

  protected reload(): void {
    this.store.reloadNow();
  }
}
