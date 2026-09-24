import { afterNextRender, Injector } from '@angular/core';
import { AbstractControl, FormArray, FormGroup } from '@angular/forms';
import { FieldError } from '../../api/models';
import { ApiError } from '../../core/errors/api-error';

/** Error key set on a control that the server rejected; value is the server's error code. */
export const SERVER_ERROR = 'server';

/**
 * Puts backend field errors on the matching controls, including array paths such as
 * `receipts[1].amount` (FE-013). Values the user typed are left untouched.
 * Returns the field errors that matched no control, so the page can show them in a summary.
 */
export function applyServerErrors(form: FormGroup, error: ApiError): FieldError[] {
  const unmatched: FieldError[] = [];
  for (const fieldError of error.fieldErrors) {
    const control = findControl(form, fieldError.field);
    if (control) {
      control.setErrors({ ...(control.errors ?? {}), [SERVER_ERROR]: fieldError.code });
      control.markAsTouched();
    } else {
      unmatched.push(fieldError);
    }
  }
  return unmatched;
}

/** Resolves `a.b[2].c` against nested FormGroup/FormArray controls. */
export function findControl(root: AbstractControl, path: string): AbstractControl | null {
  const segments = path.match(/[^.[\]]+/g) ?? [];
  let current: AbstractControl | null = root;
  for (const segment of segments) {
    if (current instanceof FormArray) {
      current = current.at(Number(segment)) ?? null;
    } else if (current instanceof FormGroup) {
      current = current.get(segment);
    } else {
      return null;
    }
    if (!current) return null;
  }
  return current === root ? null : current;
}

/**
 * Moves focus to the first invalid field inside `host` (guide §5: focus first invalid field).
 * Runs after the next render, because invalid-state classes update during change detection.
 */
export function focusFirstInvalid(host: HTMLElement, injector: Injector): void {
  afterNextRender(
    () => {
      const target = host.querySelector<HTMLElement>(
        'input.ng-invalid, textarea.ng-invalid, mat-select.ng-invalid, [aria-invalid="true"]',
      );
      target?.focus();
    },
    { injector },
  );
}
