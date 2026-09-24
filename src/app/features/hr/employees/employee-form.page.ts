import {
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  OnInit,
  resource,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatOption, MatSelect } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Api } from '../../../api/api';
import {
  createEmployee,
  getEmployee,
  listDepartments,
  updateEmployee,
} from '../../../api/functions';
import { Employee, EmployeeCreate, EmployeeStatus } from '../../../api/models';
import { ApiError, isApiError } from '../../../core/errors/api-error';
import { newIdempotencyKey, versioned, Versioned } from '../../../core/http/versioned';
import { SessionService } from '../../../core/session/session.service';
import { employeeSearch } from '../../../shared/forms/picker-searches';
import { SearchPicker } from '../../../shared/forms/search-picker';
import { FieldErrorText } from '../../../shared/forms/field-error';
import { applyServerErrors, focusFirstInvalid } from '../../../shared/forms/server-errors';
import { HasUnsavedChanges } from '../../../shared/forms/unsaved-changes.guard';
import { ErrorAlert } from '../../../shared/ui/error-alert';
import { Notifier } from '../../../shared/ui/notifier';
import { StatusBadge } from '../../../shared/ui/status-badge';
import { EMPLOYEE_STATUS_TONES } from './employee-status';

/** Employee create / edit / detail (H02). `employeeId` is absent on the create route. */
@Component({
  selector: 'app-employee-form-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
    MatButton,
    MatFormField,
    MatLabel,
    MatHint,
    MatError,
    MatInput,
    MatSelect,
    MatOption,
    MatProgressBar,
    SearchPicker,
    FieldErrorText,
    ErrorAlert,
    StatusBadge,
  ],
  templateUrl: './employee-form.page.html',
  styleUrl: './employee-form.page.scss',
})
export class EmployeeFormPage implements OnInit, HasUnsavedChanges {
  protected readonly employeeSearch = employeeSearch();
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly session = inject(SessionService);
  private readonly injector = inject(Injector);

  readonly employeeId = input<string>();

  protected readonly isNew = computed(() => !this.employeeId());
  protected readonly canEdit = computed(() => this.session.permissions().has('employees.write'));
  protected readonly statuses: EmployeeStatus[] = ['ACTIVE', 'INACTIVE'];
  protected readonly statusTones = EMPLOYEE_STATUS_TONES;

  protected readonly form = inject(FormBuilder).nonNullable.group({
    employeeNumber: ['', Validators.required],
    fullName: ['', Validators.required],
    email: ['', Validators.email],
    phone: [''],
    departmentId: [''],
    managerId: this.nullableId(),
    status: ['ACTIVE' as EmployeeStatus],
  });

  protected readonly loaded = resource({
    params: () => this.employeeId(),
    loader: async ({ params: employeeId }) => {
      const result = versioned(await this.api.invoke$Response(getEmployee, { employeeId }));
      this.fill(result);
      return result;
    },
  });

  protected readonly departments = resource({
    loader: () => this.api.invoke(listDepartments),
    defaultValue: [],
  });

  protected readonly saving = signal(false);
  protected readonly saveError = signal<ApiError | null>(null);
  protected readonly conflict = computed(() => {
    const status = this.saveError()?.status;
    return status === 409 || status === 412;
  });

  private etag = '';
  /** One key per create intent; kept across retries, replaced after success (FE-015). */
  private idempotencyKey = newIdempotencyKey();

  ngOnInit(): void {
    if (!this.canEdit()) this.form.disable();
  }

  hasUnsavedChanges(): boolean {
    return this.form.dirty && !this.saving();
  }

  protected async save(): Promise<void> {
    if (this.saving()) return;
    this.saveError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      focusFirstInvalid(this.host.nativeElement, this.injector);
      return;
    }
    this.saving.set(true);
    try {
      const saved = this.isNew() ? await this.create() : await this.update();
      this.form.markAsPristine();
      this.notifier.success(this.isNew() ? 'employees.created' : 'employees.saved');
      if (this.isNew()) {
        this.idempotencyKey = newIdempotencyKey();
        await this.router.navigate(['/hr/employees', saved.data.id], { replaceUrl: true });
      } else {
        this.fill(saved);
      }
    } catch (error) {
      if (!isApiError(error)) throw error;
      this.saveError.set(error);
      if (error.fieldErrors.length > 0) {
        applyServerErrors(this.form, error);
        focusFirstInvalid(this.host.nativeElement, this.injector);
      }
    } finally {
      this.saving.set(false);
    }
  }

  /** After a 412 the user reloads the latest version; their unsaved edits are discarded. */
  protected reloadLatest(): void {
    this.saveError.set(null);
    this.form.markAsPristine();
    this.loaded.reload();
  }

  private async create(): Promise<Versioned<Employee>> {
    const response = await this.api.invoke$Response(createEmployee, {
      'Idempotency-Key': this.idempotencyKey,
      body: this.payload(),
    });
    return versioned(response);
  }

  private async update(): Promise<Versioned<Employee>> {
    const response = await this.api.invoke$Response(updateEmployee, {
      employeeId: this.employeeId()!,
      'If-Match': this.etag,
      body: { ...this.payload(), status: this.form.controls.status.value },
    });
    return versioned(response);
  }

  private payload(): EmployeeCreate {
    const v = this.form.getRawValue();
    return {
      employeeNumber: v.employeeNumber.trim(),
      fullName: v.fullName.trim(),
      email: v.email.trim() || null,
      phone: v.phone.trim() || null,
      departmentId: v.departmentId || null,
      managerId: v.managerId,
    };
  }

  private fill({ data, etag }: Versioned<Employee>): void {
    this.etag = etag;
    this.form.reset({
      employeeNumber: data.employeeNumber,
      fullName: data.fullName,
      email: data.email ?? '',
      phone: data.phone ?? '',
      departmentId: data.departmentId ?? '',
      managerId: data.managerId ?? null,
      status: data.status,
    });
  }

  private nullableId() {
    return inject(FormBuilder).control<string | null>(null);
  }
}
