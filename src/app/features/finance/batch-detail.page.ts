import {
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  resource,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatOption } from '@angular/material/core';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatSelect } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { Api } from '../../api/api';
import {
  getSettlementBatch,
  getSettlementExportUrl,
  recordSettlementPayment,
  startSettlementExport,
} from '../../api/functions';
import { Job, PaymentMethod, SettlementBatch } from '../../api/models';
import { ApiError, isApiError } from '../../core/errors/api-error';
import { LocaleService } from '../../core/i18n/locale.service';
import { newIdempotencyKey, versioned, Versioned } from '../../core/http/versioned';
import { SessionService } from '../../core/session/session.service';
import { formatPeriod } from '../../shared/claims/claim-status';
import { downloadFile } from '../../shared/files/file-links';
import { FieldErrorText } from '../../shared/forms/field-error';
import { applyServerErrors, focusFirstInvalid } from '../../shared/forms/server-errors';
import { HasUnsavedChanges } from '../../shared/forms/unsaved-changes.guard';
import { formatMoney, MoneyPipe } from '../../shared/format/money';
import { TenantDatePipe, todayInTimeZone } from '../../shared/format/tenant-date.pipe';
import { JobPoller } from '../../shared/jobs/job-polling';
import { Confirmation } from '../../shared/ui/confirm-dialog';
import { ErrorAlert } from '../../shared/ui/error-alert';
import { Notifier } from '../../shared/ui/notifier';
import { StatusBadge } from '../../shared/ui/status-badge';
import { BATCH_STATUS_TONES } from './batch-status';

const METHODS: PaymentMethod[] = ['BANK_TRANSFER', 'PAYROLL', 'CHEQUE', 'CASH'];

/**
 * Settlement batch (F02). Export runs as a background job; an export file is not a payment.
 * Claims become SETTLED only when finance records payment evidence (guide §3, FE-008).
 */
@Component({
  selector: 'app-batch-detail-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
    MatButton,
    MatFormField,
    MatLabel,
    MatError,
    MatInput,
    MatSelect,
    MatOption,
    MatProgressBar,
    FieldErrorText,
    ErrorAlert,
    StatusBadge,
    MoneyPipe,
    TenantDatePipe,
  ],
  templateUrl: './batch-detail.page.html',
  styleUrl: './batch-detail.page.scss',
})
export class BatchDetailPage implements HasUnsavedChanges {
  private readonly api = inject(Api);
  private readonly poller = inject(JobPoller);
  private readonly notifier = inject(Notifier);
  private readonly confirmation = inject(Confirmation);
  private readonly session = inject(SessionService);
  private readonly localeService = inject(LocaleService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly batchId = input.required<string>();

  protected readonly tones = BATCH_STATUS_TONES;
  protected readonly methods = METHODS;
  protected readonly batch = resource({
    params: () => this.batchId(),
    loader: async ({ params: batchId }): Promise<Versioned<SettlementBatch>> =>
      versioned(await this.api.invoke$Response(getSettlementBatch, { batchId })),
  });

  private readonly permissions = this.session.permissions;
  protected readonly canExport = computed(() => {
    const status = this.batch.value()?.data.status;
    return (
      this.permissions().has('settlements.export') &&
      (status === 'DRAFT' || status === 'EXPORT_CREATED' || status === 'EXPORT_FAILED')
    );
  });
  protected readonly canRecordPayment = computed(
    () =>
      this.permissions().has('settlements.update') &&
      this.batch.value()?.data.status === 'EXPORT_CREATED',
  );

  protected readonly form = inject(FormBuilder).nonNullable.group({
    reference: ['', Validators.required],
    paidOn: [todayInTimeZone(this.session.me()?.tenant.timezone ?? 'UTC'), Validators.required],
    method: ['BANK_TRANSFER' as PaymentMethod, Validators.required],
    note: [''],
  });

  protected readonly job = signal<Job | null>(null);
  protected readonly pollingStopped = signal(false);
  protected readonly busy = signal(false);
  protected readonly actionError = signal<ApiError | null>(null);
  protected readonly conflict = computed(() =>
    [409, 412].includes(this.actionError()?.status ?? 0),
  );
  private exportKey = newIdempotencyKey();
  private paymentKey = newIdempotencyKey();
  private polling: Subscription | null = null;
  private pollingJobId: string | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.polling?.unsubscribe());
    // The running export job is part of the batch, so a reload resumes watching it (FE-016).
    effect(() => {
      const data = this.batch.value()?.data;
      const jobId = data?.status === 'EXPORT_PENDING' ? (data.exportJobId ?? null) : null;
      if (jobId !== this.pollingJobId) this.watch(jobId);
    });
  }

  hasUnsavedChanges(): boolean {
    return this.form.dirty && !this.busy() && this.canRecordPayment();
  }

  protected period(value: string): string {
    return formatPeriod(value, this.localeService.locale());
  }

  protected async exportCsv(): Promise<void> {
    const current = this.batch.value();
    if (!current) return;
    await this.run(
      async () => {
        const response = await this.api.invoke$Response(startSettlementExport, {
          batchId: current.data.id,
          'If-Match': current.etag,
          'Idempotency-Key': this.exportKey,
          body: { format: 'CSV' },
        });
        this.exportKey = newIdempotencyKey();
        this.batch.set(versioned(response));
      },
      () => (this.exportKey = newIdempotencyKey()),
    );
  }

  protected async download(exportId: string, fileName: string): Promise<void> {
    await this.run(async () => {
      const link = await this.api.invoke(getSettlementExportUrl, {
        batchId: this.batchId(),
        exportId,
      });
      await downloadFile(link.url, fileName);
    });
  }

  protected async recordPayment(): Promise<void> {
    const current = this.batch.value();
    if (!current || this.busy()) return;
    this.actionError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      focusFirstInvalid(this.host.nativeElement, this.injector);
      return;
    }
    const data = current.data;
    const confirmed = await this.confirmation.ask({
      titleKey: 'finance.paymentConfirm.title',
      bodyKey: 'finance.paymentConfirm.body',
      confirmKey: 'finance.recordPayment',
      params: {
        number: data.number,
        count: data.claimCount,
        total: formatMoney(data.totalAmount, data.currency, this.localeService.locale()),
      },
    });
    if (!confirmed) return;
    const v = this.form.getRawValue();
    await this.run(
      async () => {
        const response = await this.api.invoke$Response(recordSettlementPayment, {
          batchId: data.id,
          'If-Match': current.etag,
          'Idempotency-Key': this.paymentKey,
          body: {
            reference: v.reference.trim(),
            paidOn: v.paidOn,
            method: v.method,
            note: v.note.trim() || null,
          },
        });
        this.paymentKey = newIdempotencyKey();
        this.form.markAsPristine();
        this.batch.set(versioned(response));
        this.notifier.success('finance.paymentRecorded');
      },
      () => (this.paymentKey = newIdempotencyKey()),
    );
  }

  protected reloadLatest(): void {
    this.actionError.set(null);
    this.batch.reload();
  }

  /** Runs an action; on a definite failure `onDefiniteFailure` resets that intent's key. */
  private async run(action: () => Promise<void>, onDefiniteFailure?: () => void): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.actionError.set(null);
    try {
      await action();
    } catch (error) {
      if (!isApiError(error)) throw error;
      if (!error.outcomeUnknown) onDefiniteFailure?.();
      this.actionError.set(error);
      if (applyServerErrors(this.form, error).length < error.fieldErrors.length) {
        focusFirstInvalid(this.host.nativeElement, this.injector);
      }
    } finally {
      this.busy.set(false);
    }
  }

  private watch(jobId: string | null): void {
    this.polling?.unsubscribe();
    this.polling = null;
    this.pollingJobId = jobId;
    this.job.set(null);
    this.pollingStopped.set(false);
    if (!jobId) return;
    this.polling = this.poller.watch(jobId).subscribe({
      next: (job) => this.job.set(job),
      complete: () => this.batch.reload(),
      error: () => this.pollingStopped.set(true),
    });
  }
}
