import type { WritableSignal } from '@angular/core';
import type { Result } from '../../domain/shared/result';
import type { StorageError } from '../../domain/storage/storage-error';

/**
 * A settings row shown with the changes that are still being written.
 *
 * What is shown is always the row as last stored, with every change still in
 * flight laid over it. A change shows the moment it is made; when its write
 * fails, only that change is taken away. A captured "previous" value would be
 * wrong here: it can hold another change that was itself never stored, and
 * restoring it would show a setting that is not saved.
 */
export class OptimisticRow<T extends object> {
  private stored: T;
  private readonly pending: { readonly patch: Partial<T> }[] = [];

  constructor(private readonly shown: WritableSignal<T>) {
    this.stored = shown();
  }

  /** Takes a row read from storage, or written without a change of its own. */
  setStored(row: T): void {
    this.stored = row;
    this.render();
  }

  /** Shows the change at once, writes it, and keeps what storage returns. */
  async write(
    patch: Partial<T>,
    persist: (patch: Partial<T>) => Promise<Result<T, StorageError>>,
  ): Promise<Result<T, StorageError>> {
    const change = { patch };
    this.pending.push(change);
    this.render();
    let saved: Result<T, StorageError> | null = null;
    try {
      saved = await persist(patch);
      return saved;
    } finally {
      this.pending.splice(this.pending.indexOf(change), 1);
      if (saved?.ok === true) {
        this.stored = saved.value;
      }
      this.render();
    }
  }

  private render(): void {
    this.shown.set(
      this.pending.reduce<T>((row, change) => ({ ...row, ...change.patch }), this.stored),
    );
  }
}
