import { Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

/**
 * Status label with a colour tone. The text always carries the meaning, so colour is never the
 * only signal (guide §7).
 */
@Component({
  selector: 'app-status-badge',
  imports: [TranslocoPipe],
  template: `<span class="badge" [class]="'badge tone-' + tone()">{{
    labelKey() | transloco
  }}</span>`,
  styles: `
    .badge {
      display: inline-block;
      padding: 0.125rem 0.625rem;
      border-radius: var(--mat-sys-corner-full);
      font-size: 0.8125rem;
      font-weight: 500;
      white-space: nowrap;
    }
    .tone-success {
      background: #d9f2e3;
      color: #0b5b2e;
    }
    .tone-warning {
      background: #fff0c9;
      color: #6b4a00;
    }
    .tone-danger {
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }
    .tone-info {
      background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
    }
    .tone-neutral {
      background: var(--mat-sys-surface-container-highest);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class StatusBadge {
  /** Translation namespace, e.g. `status.employee`; the key becomes `<namespace>.<value>`. */
  readonly namespace = input.required<string>();
  readonly value = input.required<string>();
  readonly tones = input<Record<string, BadgeTone>>({});

  protected readonly labelKey = computed(() => `${this.namespace()}.${this.value()}`);
  protected readonly tone = computed(() => this.tones()[this.value()] ?? 'neutral');
}
