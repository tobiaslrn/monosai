import { Dialog } from '@angular/cdk/dialog';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openRenameDialog } from './rename-dialog.component';

@Component({ template: `<button type="button">Rename</button>` })
class HostComponent {}

describe('openRenameDialog', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [HostComponent] });
  });

  afterEach(() => {
    TestBed.inject(Dialog).closeAll();
  });

  /** An ARIA reference to an id that does not exist describes nothing, and audit tools flag it as an error. */
  it('only points its aria references at elements that exist', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    void openRenameDialog(TestBed.inject(Dialog), { currentTitle: 'Old title' });
    for (let pass = 0; pass < 5; pass += 1) {
      await fixture.whenStable();
      fixture.detectChanges();
    }

    const dialog = document.querySelector('[role="dialog"]')!;
    for (const attribute of ['aria-labelledby', 'aria-describedby']) {
      const reference = dialog.getAttribute(attribute);
      if (reference !== null) {
        for (const id of reference.split(/\s+/)) {
          expect(document.getElementById(id), `${attribute} -> #${id}`).not.toBeNull();
        }
      }
    }
    expect(dialog.getAttribute('aria-labelledby')).toBe('mn-rename-title');
  });
});
