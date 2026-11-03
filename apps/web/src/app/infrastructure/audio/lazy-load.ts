/**
 * Remembers a lazy load while it succeeds or is under way, and forgets one that
 * failed: a chunk that could not be fetched offline has to be asked for again
 * after reconnecting, not replayed until the page reloads.
 */
export function retryOnRejection<T>(load: () => Promise<T>): () => Promise<T> {
  let loading: Promise<T> | null = null;
  return () => {
    if (loading === null) {
      const started = load().catch((error: unknown) => {
        if (loading === started) loading = null;
        throw error;
      });
      loading = started;
    }
    return loading;
  };
}

/**
 * Waits for `work`, but no longer than `signal` allows.
 *
 * For a wait that cannot itself be cancelled, such as `import()` on a stalled
 * connection: a Stop has to take effect now, and the work may still land later.
 */
export function untilAborted<T>(work: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (signal === undefined) {
    return work;
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      reject(new DOMException('Aborted', 'AbortError'));
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    void work.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', onAbort);
    });
  });
}
