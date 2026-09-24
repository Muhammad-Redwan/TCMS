import {
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  resource,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatOption } from '@angular/material/core';
import { MatError, MatFormField, MatHint, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatSelect } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Api } from '../../api/api';
import {
  createPolicy,
  createPolicyVersion,
  getPolicy,
  listDepartments,
  publishPolicy,
  updatePolicy,
} from '../../api/functions';
import { Policy, PolicyWrite, TransportMode } from '../../api/models';
import { ApiError, isApiError } from '../../core/errors/api-error';
import { newIdempotencyKey, versioned, Versioned } from '../../core/http/versioned';
import { SessionService } from '../../core/session/session.service';
import { AmountInput, amountValidator } from '../../shared/forms/amount-input';
import { FieldErrorText } from '../../shared/forms/field-error';
import { applyServerErrors, focusFirstInvalid } from '../../shared/forms/server-errors';
import { HasUnsavedChanges } from '../../shared/forms/unsaved-changes.guard';
import { TenantDatePipe } from '../../shared/format/tenant-date.pipe';
import { Confirmation } from '../../shared/ui/confirm-dialog';
import { ErrorAlert } from '../../shared/ui/error-alert';
import { Notifier } from '../../shared/ui/notifier';
import { StatusBadge } from '../../shared/ui/status-badge';
import { CURRENCIES, POLICY_STATUS_TONES, TRANSPORT_MODES } from './policy-status';

const rev = (policy: Policy) => policy.rev;

/**
 * Policy create / edit / view (P01). Only DRAFT versions are editable; a published version is
 * immutable, and changes start from "Create new version" (guide §5 "Policy").
 */
@Component({
  selector: 'app-policy-form-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
    MatButton,
    MatCheckbox,
    MatFormField,
    MatLabel,
    MatSuffix,
    MatHint,
    MatError,
    MatInput,
    MatSelect,
    MatOption,
    MatProgressBar,
    AmountInput,
    FieldErrorText,
    ErrorAlert,
    StatusBadge,
    TenantDatePipe,
  ],
  templateUrl: './policy-form.page.html',
  styleUrl: './policy-form.page.scss',
})
export class PolicyFormPage implements HasUnsavedChanges {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  private readonly confirmation = inject(Confirmation);
  private readonly session = inject(SessionService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly fb = inject(FormBuilder).nonNullable;

  readonly policyId = input<string>();

  protected readonly tones = POLICY_STATUS_TONES;
  protected readonly modes = TRANSPORT_MODES;
  protected readonly currencies = CURRENCIES;
  protected readonly isNew = computed(() => !this.policyId());
  private readonly canWrite = computed(() => this.session.permissions().has('policies.write'));

  /** Kept separately from the form so amount validators can read it without a cycle. */
  protected readonly currency = signal(this.session.me()?.tenant.currency ?? 'KWD');

  protected readonly form = this.fb.group({
    name: ['', Validators.required],
    effectiveFrom: ['', Validators.required],
    currency: [this.currency(), Validators.required],
    monthlyLimit: ['', [Validators.required, amountValidator(() => this.currency())]],
    perTripLimit: ['', [Validators.required, amountValidator(() => this.currency())]],
    receiptRequiredAbove: ['', [Validators.required, amountValidator(() => this.currency())]],
    allowedModes: [
      ['TAXI', 'RIDE_HAILING', 'BUS', 'METRO'] as TransportMode[],
      Validators.required,
    ],
    eligibleDepartmentIds: [[] as string[]],
    submissionDeadlineDays: [10, [Validators.required, Validators.min(0)]],
  });

  protected readonly loaded = resource({
    params: () => this.policyId(),
    loader: async ({ params: policyId }) => {
      const result = versioned(await this.api.invoke$Response(getPolicy, { policyId }), rev);
      this.fill(result);
      return result;
    },
  });
  protected readonly departments = resource({
    loader: () => this.api.invoke(listDepartments),
    defaultValue: [],
  });

  protected readonly editable = computed(() => {
    const status = this.loaded.value()?.data.status;
    return this.canWrite() && (this.isNew() || status === 'DRAFT');
  });
  protected readonly canCreateVersion = computed(
    () => this.canWrite() && this.loaded.value()?.data.status === 'PUBLISHED',
  );

  protected readonly busy = signal(false);
  protected readonly actionError = signal<ApiError | null>(null);
  protected readonly conflict = computed(() =>
    [409, 412].includes(this.actionError()?.status ?? 0),
  );
  private etag = '';
  private createKey = newIdempotencyKey();
  private versionKey = newIdempotencyKey();

  constructor() {
    this.form.controls.currency.valueChanges.pipe(takeUntilDestroyed()).subscribe((currency) => {
      this.currency.set(currency);
      for (const name of ['monthlyLimit', 'perTripLimit', 'receiptRequiredAbove'] as const) {
        this.form.controls[name].updateValueAndValidity();
      }
    });
  }

  hasUnsavedChanges(): boolean {
    return this.form.dirty && !this.busy();
  }

  protected isModeSelected(mode: TransportMode): boolean {
    return this.form.controls.allowedModes.value.includes(mode);
  }

  protected toggleMode(mode: TransportMode, checked: boolean): void {
    const modes = this.form.controls.allowedModes.value.filter((m) => m !== mode);
    this.form.controls.allowedModes.setValue(checked ? [...modes, mode] : modes);
    this.form.controls.allowedModes.markAsDirty();
    this.form.controls.allowedModes.markAsTouched();
  }

  protected async save(): Promise<void> {
    if (!this.validate()) return;
    await this.run(async () => {
      if (this.isNew()) {
        const response = await this.api.invoke$Response(createPolicy, {
          'Idempotency-Key': this.createKey,
          body: this.payload(),
        });
        const created = versioned(response, rev);
        this.form.markAsPristine();
        this.createKey = newIdempotencyKey();
        this.notifier.success('policies.saved');
        await this.router.navigate(['/policies', created.data.id], { replaceUrl: true });
      } else {
        const response = await this.api.invoke$Response(updatePolicy, {
          policyId: this.policyId()!,
          'If-Match': this.etag,
          body: this.payload(),
        });
        this.apply(versioned(response, rev));
        this.notifier.success('policies.saved');
      }
    });
  }

  protected async publish(): Promise<void> {
    if (this.form.dirty) return;
    const policy = this.loaded.value()?.data;
    if (!policy) return;
    const confirmed = await this.confirmation.ask({
      titleKey: 'policies.publishConfirm.title',
      bodyKey: 'policies.publishConfirm.body',
      confirmKey: 'policies.publish',
      params: { version: policy.version, date: policy.effectiveFrom },
    });
    if (!confirmed) return;
    await this.run(async () => {
      const response = await this.api.invoke$Response(publishPolicy, {
        policyId: policy.id,
        'If-Match': this.etag,
      });
      this.apply(versioned(response, rev));
      this.notifier.success('policies.published');
    });
  }

  protected async createVersion(): Promise<void> {
    const policy = this.loaded.value()?.data;
    if (!policy) return;
    await this.run(async () => {
      const draft = await this.api.invoke(createPolicyVersion, {
        policyId: policy.id,
        'Idempotency-Key': this.versionKey,
      });
      this.versionKey = newIdempotencyKey();
      await this.router.navigate(['/policies', draft.id]);
    });
  }

  protected reloadLatest(): void {
    this.actionError.set(null);
    this.form.markAsPristine();
    this.loaded.reload();
  }

  private validate(): boolean {
    this.actionError.set(null);
    if (this.form.valid) return true;
    this.form.markAllAsTouched();
    focusFirstInvalid(this.host.nativeElement, this.injector);
    return false;
  }

  private async run(action: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.actionError.set(null);
    try {
      await action();
    } catch (error) {
      if (!isApiError(error)) throw error;
      this.actionError.set(error);
      if (applyServerErrors(this.form, error).length < error.fieldErrors.length) {
        focusFirstInvalid(this.host.nativeElement, this.injector);
      }
    } finally {
      this.busy.set(false);
    }
  }

  private payload(): PolicyWrite {
    const v = this.form.getRawValue();
    return { ...v, name: v.name.trim() };
  }

  private apply(result: Versioned<Policy>): void {
    this.loaded.set(result);
    this.fill(result);
  }

  private fill({ data, etag }: Versioned<Policy>): void {
    this.etag = etag;
    this.form.reset({
      name: data.name,
      effectiveFrom: data.effectiveFrom,
      currency: data.currency,
      monthlyLimit: data.monthlyLimit,
      perTripLimit: data.perTripLimit,
      receiptRequiredAbove: data.receiptRequiredAbove,
      allowedModes: [...data.allowedModes],
      eligibleDepartmentIds: [...(data.eligibleDepartmentIds ?? [])],
      submissionDeadlineDays: data.submissionDeadlineDays,
    });
    if (data.status === 'DRAFT' && this.canWrite()) this.form.enable();
    else this.form.disable();
  }
}
