import { Component, computed, ElementRef, inject, Injector, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { TranslocoPipe } from '@jsverse/transloco';
import { Api } from '../../api/api';
import { createDepartment, updateDepartment } from '../../api/functions';
import { Department, DepartmentWrite } from '../../api/models';
import { ApiError, isApiError } from '../../core/errors/api-error';
import { etagFromVersion, newIdempotencyKey } from '../../core/http/versioned';
import { employeeSearch } from '../../shared/forms/picker-searches';
import { SearchPicker } from '../../shared/forms/search-picker';
import { FieldErrorText } from '../../shared/forms/field-error';
import { applyServerErrors, focusFirstInvalid } from '../../shared/forms/server-errors';
import { ErrorAlert } from '../../shared/ui/error-alert';

export interface DepartmentDialogData {
  department?: Department;
}

/** Add or edit one department; closes with the saved department. */
@Component({
  selector: 'app-department-dialog',
  imports: [
    ReactiveFormsModule,
    TranslocoPipe,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatDialogClose,
    MatButton,
    MatFormField,
    MatLabel,
    MatError,
    MatInput,
    SearchPicker,
    FieldErrorText,
    ErrorAlert,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ (isNew() ? 'departments.newTitle' : 'departments.editTitle') | transloco }}
    </h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content>
        @if (conflict()) {
          <div class="conflict" role="alert">{{ 'errors.CONFLICT' | transloco }}</div>
        } @else if (saveError(); as error) {
          @if (error.fieldErrors.length === 0) {
            <app-error-alert [error]="error" />
          }
        }
        <mat-form-field class="full">
          <mat-label>{{ 'departments.fields.name' | transloco }}</mat-label>
          <input
            matInput
            formControlName="name"
            required
            dir="auto"
            data-testid="department-name"
          />
          <mat-error>
            <app-field-error [control]="form.controls.name" [errors]="form.controls.name.errors" />
          </mat-error>
        </mat-form-field>
        <app-search-picker
          formControlName="managerId"
          [label]="'departments.fields.manager' | transloco"
          [search]="employeeSearch"
          [initialLabel]="data.department?.managerName ?? null"
        />
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" [mat-dialog-close]="undefined">
          {{ 'common.cancel' | transloco }}
        </button>
        <button
          matButton="filled"
          type="submit"
          [disabled]="saving() || conflict()"
          data-testid="save-department"
        >
          {{ 'common.save' | transloco }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .full {
      width: 100%;
    }
  `,
})
export class DepartmentDialog {
  protected readonly employeeSearch = employeeSearch();
  private readonly api = inject(Api);
  private readonly ref = inject<MatDialogRef<DepartmentDialog, Department>>(MatDialogRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  protected readonly data = inject<DepartmentDialogData>(MAT_DIALOG_DATA);

  protected readonly isNew = computed(() => !this.data.department);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: [this.data.department?.name ?? '', Validators.required],
    managerId: inject(FormBuilder).control<string | null>(this.data.department?.managerId ?? null),
  });

  protected readonly saving = signal(false);
  protected readonly saveError = signal<ApiError | null>(null);
  /** A stale edit cannot be retried here: the list reloads with the latest version. */
  protected readonly conflict = computed(() => [409, 412].includes(this.saveError()?.status ?? 0));
  private readonly idempotencyKey = newIdempotencyKey();

  protected async save(): Promise<void> {
    if (this.saving()) return;
    this.saveError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      focusFirstInvalid(this.host.nativeElement, this.injector);
      return;
    }
    this.saving.set(true);
    const v = this.form.getRawValue();
    const body: DepartmentWrite = { name: v.name.trim(), managerId: v.managerId };
    try {
      const department = this.data.department;
      const saved = department
        ? await this.api.invoke(updateDepartment, {
            departmentId: department.id,
            'If-Match': etagFromVersion(department.version),
            body,
          })
        : await this.api.invoke(createDepartment, { 'Idempotency-Key': this.idempotencyKey, body });
      this.ref.close(saved);
    } catch (error) {
      if (!isApiError(error)) throw error;
      this.saveError.set(error);
      if (applyServerErrors(this.form, error).length < error.fieldErrors.length) {
        focusFirstInvalid(this.host.nativeElement, this.injector);
      }
    } finally {
      this.saving.set(false);
    }
  }
}
