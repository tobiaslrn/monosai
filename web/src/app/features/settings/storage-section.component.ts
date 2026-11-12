import { DOCUMENT, ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { AudioPlaybackStore } from '../../application/audio/audio-playback.store';
import { AudioCompressionStore } from '../../application/settings/audio-compression.store';
import { StorageStore } from '../../application/settings/storage.store';
import { openConfirmDialog } from '../../shared-ui/confirm-dialog/confirm-dialog.component';
import { SettingsRowComponent } from '../../shared-ui/settings-row/settings-row.component';
import { SectionComponent } from '../../shared-ui/section/section.component';
import { StatusLineComponent } from '../../shared-ui/status-line/status-line.component';

function formatBytes(bytes: number | null): string {
  if (bytes === null) {
    return 'Unknown';
  }
  const units = ['B', 'kB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/**
 * Browser storage protection, cache clearing, and deleting everything.
 *
 * Each deletion is a row that opens a confirmation naming what goes. A full
 * reset requires two explicit confirmations and only then deletes local data
 * before reloading into the first-use state.
 */
@Component({
  selector: 'mn-storage-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SectionComponent, SettingsRowComponent, StatusLineComponent],
  template: `
    <mn-section heading="Storage" [rows]="true">
      <mn-settings-row label="Space used" [value]="usageLabel()" />

      @if (storage.status().canRequest) {
        <mn-settings-row
          label="Protect storage"
          action="accent"
          testId="protect-storage"
          [disabled]="storage.action() !== 'idle' && storage.action() !== 'requesting-persistence'"
          [busy]="storage.action() === 'requesting-persistence'"
          [summary]="protectionSummary()"
          (pressed)="requestPersistence()"
        />
      } @else {
        <mn-settings-row label="Storage protection" [value]="persistenceLabel()" />
      }

      <mn-settings-row
        label="Delete saved audio"
        action="danger"
        testId="delete-saved-audio"
        [disabled]="storage.action() !== 'idle'"
        [summary]="savedAudioLabel()"
        (pressed)="clearAudio()"
      />
      @if (compression.running()) {
        <mn-settings-row
          label="Stop compressing"
          action="accent"
          testId="stop-compression"
          (pressed)="stopCompressing()"
        />
      }

      <mn-settings-row
        label="Delete all data"
        action="danger"
        testId="delete-all-data"
        [disabled]="storage.action() !== 'idle'"
        (pressed)="deleteAllData()"
      />

      @if (storage.failure(); as failure) {
        <mn-status-line mn-section-footer tone="danger">{{ failure.message }}</mn-status-line>
      }
    </mn-section>
  `,
})
export class StorageSectionComponent {
  private readonly document = inject(DOCUMENT);
  private readonly dialog = inject(Dialog);
  private readonly playback = inject(AudioPlaybackStore);
  protected readonly storage = inject(StorageStore);
  protected readonly compression = inject(AudioCompressionStore);

  /** The compact status for the browser's current storage-protection answer. */
  protected readonly persistenceLabel = computed(() => {
    switch (this.storage.persistence()) {
      case 'granted':
        return 'Protected';
      case 'unsupported':
        return 'Unavailable';
      case 'refused':
        return 'Not protected';
      case 'request-failed':
        return 'Not protected';
      case 'not-asked':
        return 'Not protected';
      case 'unknown':
        return 'Unknown';
    }
  });

  /** The result of asking replaces the line, so it never needs a note of its own. */
  protected readonly protectionSummary = computed(() =>
    this.storage.action() === 'requesting-persistence'
      ? 'Protecting…'
      : 'Not protected. The browser may clear data.',
  );

  protected readonly usageLabel = computed(() => formatBytes(this.storage.status().usageBytes));

  /**
   * What the background compression pass has to say, or `null` when it has
   * nothing to report.
   *
   * A real count rather than a percentage, and the finished sentence names what
   * was left alone as well as what was compressed: a clip this could not
   * re-encode is still there and still playable, which is the part worth
   * stating.
   */
  protected readonly compressionLabel = computed(() => {
    const state = this.compression.state();
    switch (state.kind) {
      case 'idle':
        return null;
      case 'running':
        return `Compressing ${String(state.done + 1)} of ${String(state.total)}`;
      case 'finished': {
        if (state.compressed === 0 && state.skipped === 0) {
          return null;
        }
        const clips = state.compressed === 1 ? '1 clip' : `${String(state.compressed)} clips`;
        const freed = `Compressed ${clips} and freed ${formatBytes(state.freedBytes)}.`;
        if (state.skipped === 0) {
          return freed;
        }
        const left =
          state.skipped === 1
            ? '1 clip was left as it was.'
            : `${String(state.skipped)} clips were left as they were.`;
        return `${freed} ${left}`;
      }
    }
  });

  protected readonly savedAudioLabel = computed(
    () => this.compressionLabel() ?? (this.storage.audioCleared() ? 'Audio deleted' : null),
  );

  protected stopCompressing(): void {
    this.compression.stop();
  }

  constructor() {
    void this.storage.refresh();
  }

  protected requestPersistence(): void {
    if (this.storage.action() !== 'idle') {
      return;
    }
    void this.storage.requestPersistence();
  }

  /**
   * Clears the audio cache, having confirmed the scope and then stopped
   * anything playing from it.
   *
   * Confirmed because this is the widest destructive action on the screen above
   * the danger zone: it deletes every clip of every reading on the device, and
   * it sat one button away from asking the browser to keep data — where the
   * *narrower* per-reading deletion in the reader has asked all along.
   *
   * The stop order matters and is the point: reporting an empty cache while a
   * clip out of it is still audible would be a report the learner can hear is
   * false.
   */
  protected async clearAudio(): Promise<void> {
    const confirmed = await openConfirmDialog(this.dialog, {
      title: 'Delete saved audio for every story?',
      message: 'This cannot be undone. It removes:',
      details: [
        'Every generated audio clip, for every story on this device',
        'Anything playing right now, which stops',
      ],
      footnote: 'Stories and notes are not affected.',
      confirmLabel: 'Delete audio',
      cancelLabel: 'Keep it',
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }
    this.playback.audioCacheCleared();
    await this.storage.clearAudioCache();
  }

  /**
   * Deletes everything, having asked twice: once for what goes, once more
   * because nothing brings it back. Only the second yes resets.
   */
  protected async deleteAllData(): Promise<void> {
    const first = await openConfirmDialog(this.dialog, {
      title: 'Delete all Monosai data?',
      message: 'This cannot be undone. It removes everything Monosai stores in this browser:',
      details: [
        'Every story, word list and snapshot',
        'Every saved setting',
        'Every cached aid and audio clip',
      ],
      confirmLabel: 'Continue',
      cancelLabel: 'Keep my data',
      tone: 'danger',
    });
    if (!first) {
      return;
    }
    const second = await openConfirmDialog(this.dialog, {
      title: 'Delete everything?',
      message: 'Last check. This cannot be undone.',
      confirmLabel: 'Delete everything',
      cancelLabel: 'Cancel',
      tone: 'danger',
    });
    if (!second) {
      return;
    }
    if (await this.storage.resetAllData()) {
      this.document.defaultView?.location.reload();
    }
  }
}
