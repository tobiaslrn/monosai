/**
 * Drives the app's select (`mn-select`) in a unit test: it is a combobox whose
 * listbox is always in the DOM, so a choice is a click on the option, and the
 * value is the selected option's own.
 */
function listboxOf(trigger: Element): HTMLElement {
  const id = trigger.getAttribute('aria-controls');
  const list = id === null ? null : document.getElementById(id);
  if (list === null) {
    throw new Error('the select has no listbox');
  }
  return list;
}

/** The value of the chosen option, as written on it. */
export function selectedValue(trigger: Element): string | null {
  return (
    listboxOf(trigger)
      .querySelector('[role="option"][aria-selected="true"]')
      ?.getAttribute('data-value') ?? null
  );
}

/** The values on offer, in order. */
export function optionValues(trigger: Element): string[] {
  return Array.from(listboxOf(trigger).querySelectorAll('[role="option"]')).map(
    (option) => option.getAttribute('data-value') ?? '',
  );
}

/** Chooses the option with this value, as a click would. */
export function chooseValue(trigger: Element, value: string): void {
  const option = Array.from(
    listboxOf(trigger).querySelectorAll<HTMLElement>('[role="option"]'),
  ).find((candidate) => candidate.getAttribute('data-value') === value);
  if (option === undefined) {
    throw new Error(`the select has no option "${value}"`);
  }
  option.click();
}
