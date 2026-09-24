import { Component, computed, input } from '@angular/core';
import { AbstractControl } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { SERVER_ERROR } from './server-errors';

/**
 * Translated message for the first error on a control. Put it inside <mat-error>.
 * Client rules map to `validation.<rule>`; server codes map to `validation.server.<CODE>`.
 */
@Component({
  selector: 'app-field-error',
  imports: [TranslocoPipe],
  template: `@if (message(); as m) {
    {{ m.key | transloco: m.params }}
  }`,
})
export class FieldErrorText {
  readonly control = input.required<AbstractControl>();
  /** Bump to recompute after status changes (Material re-renders mat-error on state change). */
  readonly errors = input<unknown>();

  protected readonly message = computed(() => {
    this.errors();
    const errors = this.control().errors;
    if (!errors) return null;
    if (errors[SERVER_ERROR]) {
      return { key: `validation.server.${errors[SERVER_ERROR]}`, params: {} };
    }
    const [rule, detail] = Object.entries(errors)[0];
    const params =
      typeof detail === 'object' && detail !== null ? (detail as Record<string, unknown>) : {};
    return { key: `validation.${rule}`, params };
  });
}
