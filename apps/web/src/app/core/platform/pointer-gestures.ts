/**
 * Pointer sequences an application gesture has already answered.
 *
 * A long press opens a surface while the finger is still down, so the release
 * that ends it — and the click the browser synthesizes from it — no longer mean
 * anything. Two independent listeners have to agree about that: the paragraph
 * that recognized the press, and the popover service, whose outside-press rule
 * would otherwise read the same release as "put this away" and close the sheet
 * the press had just opened.
 *
 * Recorded by pointer id rather than by a flag, so a second finger elsewhere is
 * unaffected, and forgotten again on that pointer's next press or after a short
 * grace period, so nothing can be left permanently ignored.
 */

/** How long a consumed sequence stays consumed without being pressed again. */
const CONSUMED_TTL_MS = 1_000;

const consumed = new Map<number, number>();

/** Marks everything left of this pointer's sequence as already answered. */
export function consumePointerGesture(pointerId: number): void {
  consumed.set(pointerId, Date.now());
}

/** True while this pointer's release and click belong to a gesture already made. */
export function isPointerGestureConsumed(pointerId: number): boolean {
  const at = consumed.get(pointerId);
  if (at === undefined) {
    return false;
  }
  if (Date.now() - at > CONSUMED_TTL_MS) {
    consumed.delete(pointerId);
    return false;
  }
  return true;
}

/** A new press with the same id is a new gesture, whatever the last one meant. */
export function releasePointerGesture(pointerId: number): void {
  consumed.delete(pointerId);
}
