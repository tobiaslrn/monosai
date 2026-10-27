import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DockedPlayerDirective } from './docked-player.directive';
import { ReaderGeometryService } from './reader-geometry.service';

const geometry = {
  attachPlayer: vi.fn<(shell: HTMLElement) => void>(),
  detachPlayer: vi.fn<(shell?: HTMLElement) => void>(),
};

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DockedPlayerDirective],
  template: `
    @if (open()) {
      <div mnDockedPlayer class="player">Player</div>
    }
  `,
})
class HostComponent {
  readonly open = signal(true);
}

describe('DockedPlayerDirective', () => {
  beforeEach(() => {
    geometry.attachPlayer.mockClear();
    geometry.detachPlayer.mockClear();
    TestBed.configureTestingModule({
      providers: [{ provide: ReaderGeometryService, useValue: geometry }],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('attaches the shell once it is rendered, and detaches that shell when it goes', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    expect(geometry.attachPlayer).not.toHaveBeenCalled();

    await fixture.whenStable();
    const shell = (fixture.nativeElement as HTMLElement).querySelector('.player');
    expect(geometry.attachPlayer).toHaveBeenCalledExactlyOnceWith(shell);

    fixture.componentInstance.open.set(false);
    await fixture.whenStable();
    expect(geometry.detachPlayer).toHaveBeenCalledExactlyOnceWith(shell);
  });
});
