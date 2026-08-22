import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import {
  GenerationStore,
  type GenerationState,
} from '../../application/generation/generation.store';

interface WaitCopy {
  readonly key: string;
  readonly title: string;
  readonly detail: string;
}

/** Human wording for each real state of the generation job. */
export function generationWaitCopy(state: GenerationState): WaitCopy {
  switch (state.kind) {
    case 'checking-prerequisites':
      return {
        key: state.kind,
        title: 'Checking your setup',
        detail: 'Making sure the model, vocabulary, and grammar profile are ready.',
      };
    case 'preparing':
      return {
        key: state.kind,
        title: 'Preparing your vocabulary',
        detail: 'Collecting the reviewed words this story may use.',
      };
    case 'writing':
      return {
        key: state.kind,
        title: 'Generating your story',
        detail: 'The model is writing the Japanese. This is usually the longest step.',
      };
    case 'parsing':
      return {
        key: state.kind,
        title: 'Reading the generated Japanese',
        detail: 'Breaking the story into words so it can be checked locally.',
      };
    case 'validating':
      return {
        key: state.kind,
        title: 'Checking the vocabulary',
        detail: 'Comparing every word with your reviewed vocabulary.',
      };
    case 'exception-review': {
      const count = state.candidateCount;
      return {
        key: `${state.kind}-${String(count)}`,
        title: `Reviewing ${String(count)} unfamiliar ${count === 1 ? 'word' : 'words'}`,
        detail: 'Checking whether your exception policy allows them.',
      };
    }
    case 'repairing': {
      const count = state.unknownCount;
      const title =
        count > 0
          ? `Replacing ${String(count)} unfamiliar ${count === 1 ? 'word' : 'words'}${state.structureIssueCount > 0 ? ' and fixing the structure' : ''}`
          : 'Fixing the story structure';
      return {
        key: `${state.kind}-${String(state.attempt)}`,
        title,
        detail: `Repair attempt ${String(state.attempt)} of 2. The revised story will be checked again.`,
      };
    }
    case 'auxiliary-review':
      return {
        key: state.kind,
        title: 'Reviewing grammar and translating',
        detail: 'These two finishing checks are running at the same time.',
      };
    case 'finalizing':
      return {
        key: state.kind,
        title: 'Saving your story',
        detail: 'Adding the Japanese and available reading aids to your library.',
      };
    case 'saved':
      return {
        key: state.kind,
        title: 'Your story is ready',
        detail: `Saved “${state.reading.title}”.`,
      };
    case 'cancelled':
      return { key: state.kind, title: 'Generation stopped', detail: 'Nothing was saved.' };
    case 'invalid-draft':
      return {
        key: state.kind,
        title: 'The story still needs work',
        detail: 'It could not be made valid after two repair attempts.',
      };
    case 'failed':
      return { key: state.kind, title: 'Generation stopped', detail: state.error.message };
    case 'idle':
      return { key: state.kind, title: 'Ready to generate', detail: '' };
  }
}

@Component({
  selector: 'mn-generation-wait',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="loader" aria-hidden="true">
      <svg class="mark" viewBox="0 0 1024 1024" focusable="false">
        <defs>
          <path
            id="generation-leaf-shadow"
            pathLength="1"
            d="M320.55 743.69C320.99 733.48 321.71 722.95 323.83 712.73C332.68 669.88 360.49 614.77 381.01 575.62C419.15 502.87 479.42 406.08 538.51 349.54C577.7 312.04 624.4 285.04 667.33 252.38C695.48 230.97 721.34 206.33 741.6 177.21C747.93 168.12 758.28 147.18 767.4 142.4C770.01 141.03 772.29 141.08 775.09 140.84C777.02 141.96 778.72 142.54 780.3 144.32C787.76 152.71 788.86 170.51 790.53 181.35C796.35 219.22 799.87 257.55 801.77 295.81C802.7 314.56 803.12 333.34 802.95 352.12C802.75 373.89 801.47 395.63 799.54 417.31C793.99 479.47 779.85 543.48 726.5 582.45C686.63 611.58 630.15 623.47 582.27 631.94C589.61 677.56 608.01 721.61 636.95 757.88C646.81 770.24 658.08 781.3 670.27 791.36C679.32 798.83 688.07 803.03 689.24 815.65C688.47 817.12 688.1 818.54 687.02 819.89C680.75 827.69 668.22 828.6 659.03 829.94C632.54 833.82 605.68 835.71 578.95 836.95C505.58 840.38 428.84 835.31 358.96 811.33C320.55 798.15 281.87 777.28 255.57 745.62C222.79 706.16 228.27 666.01 228.28 618.37C228.28 564.75 228.26 511.13 228.27 457.5C228.27 440.08 228.26 422.66 228.26 405.24C228.26 394.11 227.87 382.88 228.84 371.79C229.71 361.78 232.1 351.98 236.2 342.79C239.07 336.35 242.86 330.33 247.49 325.01C278.85 288.93 323.97 300.93 363.61 312.34C380.31 317.14 397.01 321.93 413.75 326.6C422.38 329.01 431.04 331.31 439.72 333.57C460.37 338.95 489.93 346.67 485.49 374.65C483.44 387.55 474.85 398.52 467.45 408.85C456.52 424.11 445.53 439.3 435.12 454.93C395.35 514.65 359.84 582.96 334.75 650.19C324.03 678.91 310.67 713.09 320.55 743.69Z"
          />
          <path
            id="generation-leaf-light"
            pathLength="1"
            d="M320.23 743.36C321.43 733.53 321.88 721.47 324.26 710.67C334.51 664.14 367.95 598.89 391.31 556.56C429.46 487.43 483.78 400.88 541.23 346.96C579.75 310.81 625.21 284.38 667.07 252.58C695.68 230.84 721.87 205.8 742.34 176.14C748.53 167.17 758.57 146.68 767.84 142.22C770.48 140.94 772.77 141.07 775.57 140.92C777.69 142.28 779.52 143.13 781.11 145.27C788.26 154.81 790.55 180.85 792.23 193.14C798.97 242.41 802.91 292.25 802.98 342C803.01 367.05 801.78 392.04 799.56 416.99C793.58 484.38 778.01 550.86 716.62 589.1C685.07 608.76 647.86 618.38 611.84 626.08C558.44 637.5 504.22 644.28 452.49 662.55C419.67 674.13 372.83 694.95 354.28 725.83C330.86 764.8 379.39 788.13 408.58 799.94C465.89 823.14 529.57 829.9 590.93 831.23C611.48 831.67 632.13 829.68 652.6 830.23C625.07 835.73 583.98 837.18 555.29 837.56C484.31 838.5 410.13 832.39 343.68 805.68C302.71 789.21 259.43 762.15 239.63 721.07C226.46 693.77 228.3 664.19 228.28 634.7C228.27 592.78 228.25 550.86 228.26 508.94C228.27 474.1 228.25 439.26 228.26 404.42C228.27 378.51 227.59 352.17 243.46 330.1C278.94 280.76 340.99 305.87 387.87 319.33C399.1 322.55 410.35 325.7 421.61 328.78C442.88 334.6 481.64 338.88 485.59 365.86C487.59 379.54 479.16 392.23 471.7 402.88C457.64 422.92 442.99 442.51 429.75 463.13C392.35 521.4 359.68 583.81 335.32 648.68C324.12 678.49 311.73 711.4 320.23 743.36Z"
          />
        </defs>
        <rect class="mark__background" width="1024" height="1024" rx="144" />
        <g transform="translate(-102.4,-102.4) scale(1.2)">
          <use class="mark__shadow" href="#generation-leaf-shadow" />
          <use class="mark__light" href="#generation-leaf-light" />
          <use class="mark__trace mark__trace--outer" href="#generation-leaf-shadow" />
          <use class="mark__trace mark__trace--inner" href="#generation-leaf-light" />
        </g>
      </svg>
    </div>

    @for (message of [copy()]; track message.key) {
      <div class="copy" data-testid="generation-copy">
        <p class="eyebrow">Creating your reading</p>
        <h2>{{ message.title }}</h2>
        <p>{{ message.detail }}</p>
      </div>
    }
  `,
  styleUrl: './generation-wait.component.scss',
})
export class GenerationWaitComponent {
  private readonly generation = inject(GenerationStore);

  protected readonly copy = computed(() => generationWaitCopy(this.generation.state()));
}
