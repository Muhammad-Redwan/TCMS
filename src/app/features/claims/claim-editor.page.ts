import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  resource,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatOption } from '@angular/material/core';
import { MatError, MatFormField, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatSelect } from '@angular/material/select';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Api } from '../../api/api';
import {
  createClaim,
  deleteClaim,
  getClaim,
  getCurrentPolicy,
  getReceiptUploadPolicy,
  updateClaim,
} from '../../api/functions';
import { Claim, ClaimItem, ClaimWrite, TransportMode } from '../../api/models';
import { ApiError, isApiError } from '../../core/errors/api-error';
import { LocaleService } from '../../core/i18n/locale.service';
import { newIdempotencyKey, versioned, Versioned } from '../../core/http/versioned';
import { SessionService } from '../../core/session/session.service';
import { AmountInput, amountValidator } from '../../shared/forms/amount-input';
import { FieldErrorText } from '../../shared/forms/field-error';
import { applyServerErrors, focusFirstInvalid } from '../../shared/forms/server-errors';
import { HasUnsavedChanges } from '../../shared/forms/unsaved-changes.guard';
import { formatMoney, MoneyPipe } from '../../shared/format/money';
import { todayInTimeZone } from '../../shared/format/tenant-date.pipe';
import { pollDelay } from '../../shared/jobs/job-polling';
import { Confirmation } from '../../shared/ui/confirm-dialog';
import { ErrorAlert } from '../../shared/ui/error-alert';
import { Notifier } from '../../shared/ui/notifier';
import { StatusBadge } from '../../shared/ui/status-badge';
import { TRANSPORT_MODES } from '../policies/policy-status';
import { CLAIM_STATUS_TONES, formatPeriod } from '../../shared/claims/claim-status';
import { ClaimFindings } from '../../shared/claims/claim-findings';
import { ClaimSubmitter } from './claim-submitter';
import { ClaimTimeline } from '../../shared/claims/claim-timeline';
import { ReceiptsPanel } from './receipts-panel';

type ItemForm = FormGroup<{
  tripDate: FormControl<string>;
  mode: FormControl<TransportMode>;
  fromLocation: FormControl<string>;
  toLocation: FormControl<string>;
  purpose: FormControl<string>;
  amount: FormControl<string>;
  receiptId: FormControl<string>;
}>;

/**
 * Create and edit a claim (C02/C03). The server owns totals, policy findings and state: the page
 * shows what the last save returned, asks to save before submitting, and renders only the
 * actions the server allows. Reload restores everything from the server (FE-004).
 */
@Component({
  selector: 'app-claim-editor-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
    MatButton,
    MatFormField,
    MatLabel,
    MatSuffix,
    MatError,
    MatInput,
    MatSelect,
    MatOption,
    MatProgressBar,
    AmountInput,
    FieldErrorText,
    ErrorAlert,
    StatusBadge,
    MoneyPipe,
    ClaimFindings,
    ClaimTimeline,
    ReceiptsPanel,
  ],
  templateUrl: './claim-editor.page.html',
  styleUrl: './claim-editor.page.scss',
})
export class ClaimEditorPage implements HasUnsavedChanges {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  private readonly confirmation = inject(Confirmation);
  private readonly submitter = inject(ClaimSubmitter);
  private readonly session = inject(SessionService);
  private readonly localeService = inject(LocaleService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly route = inject(ActivatedRoute);

  readonly claimId = input<string>();

  protected readonly modes = TRANSPORT_MODES;
  protected readonly tones = CLAIM_STATUS_TONES;
  protected readonly isNew = computed(() => !this.claimId());

  protected readonly claim = resource({
    params: () => this.claimId(),
    loader: async ({ params: claimId }) => {
      const result = versioned(await this.api.invoke$Response(getClaim, { claimId }));
      if (!this.form.dirty) this.fill(result.data);
      this.etag = result.etag;
      return result;
    },
  });
  protected readonly policy = resource({ loader: () => this.api.invoke(getCurrentPolicy) });
  protected readonly uploadPolicy = resource({
    loader: () => this.api.invoke(getReceiptUploadPolicy),
  });

  protected readonly currency = computed(
    () =>
      this.claim.value()?.data.currency ??
      this.policy.value()?.currency ??
      this.session.me()?.tenant.currency ??
      'KWD',
  );

  protected readonly form = this.fb.group({
    period: ['', Validators.required],
    items: new FormArray<ItemForm>([]),
  });

  protected readonly editable = computed(
    () => this.isNew() || !!this.claim.value()?.data.allowedActions.includes('EDIT'),
  );
  protected readonly canDelete = computed(
    () => !!this.claim.value()?.data.allowedActions.includes('DELETE'),
  );
  /** Receipts still scanning; the page polls while any exist. */
  private readonly scanning = computed(() =>
    (this.claim.value()?.data.receipts ?? []).some((r) => r.scanStatus === 'SCANNING'),
  );
  /** Receipts not yet usable (scanning, or an upload that never finished): submit waits. */
  protected readonly receiptsBusy = computed(() =>
    (this.claim.value()?.data.receipts ?? []).some(
      (r) => r.scanStatus === 'SCANNING' || r.scanStatus === 'AWAITING_UPLOAD',
    ),
  );
  protected readonly hasBlocking = computed(() =>
    (this.claim.value()?.data.findings ?? []).some((f) => f.severity === 'BLOCKING'),
  );
  /** Latest reviewer request, shown prominently while changes are needed (FE-007). */
  protected readonly reviewerNote = computed(() => {
    const claim = this.claim.value()?.data;
    if (claim?.status !== 'NEEDS_CHANGES') return null;
    return [...claim.timeline].reverse().find((e) => e.type === 'CHANGES_REQUESTED') ?? null;
  });

  /** Months a new claim may cover: this month and last month, in the tenant's calendar. */
  protected readonly periods = computed(() => {
    const today = todayInTimeZone(this.session.me()?.tenant.timezone ?? 'UTC');
    const [year, month] = today.split('-').map(Number);
    const previous =
      month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
    const options = [today.slice(0, 7), previous];
    const current = this.claim.value()?.data.period;
    return current && !options.includes(current) ? [current, ...options] : options;
  });

  protected readonly dirty = signal(false);
  protected readonly busy = signal(false);
  protected readonly actionError = signal<ApiError | null>(null);
  protected readonly conflict = computed(() =>
    [409, 412].includes(this.actionError()?.status ?? 0),
  );
  private etag = '';
  private createKey = newIdempotencyKey();

  constructor() {
    this.form.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.dirty.set(this.form.dirty));

    if (this.isNewRoute()) {
      this.form.controls.period.setValue(this.periods()[0]);
      this.addItem();
      this.form.markAsPristine();
    }

    // While receipts are being scanned, re-read the claim with backoff (guide §4 "Jobs").
    let attempt = 0;
    effect((onCleanup) => {
      // Track the claim itself, not just "is scanning": that boolean stays true between polls,
      // so the effect would not re-run after the first reload.
      this.claim.value();
      if (!this.scanning()) {
        attempt = 0;
        return;
      }
      const timer = setTimeout(() => this.claim.reload(), pollDelay(attempt++));
      onCleanup(() => clearTimeout(timer));
    });
  }

  hasUnsavedChanges(): boolean {
    return this.form.dirty && !this.busy();
  }

  protected get items(): FormArray<ItemForm> {
    return this.form.controls.items;
  }

  protected period(value: string): string {
    return formatPeriod(value, this.localeService.locale());
  }

  protected receiptName(receiptId: string | null | undefined): string | null {
    return this.claim.value()?.data.receipts.find((r) => r.id === receiptId)?.fileName ?? null;
  }

  protected addItem(item?: ClaimItem): void {
    this.items.push(
      this.fb.group({
        tripDate: [item?.tripDate ?? '', Validators.required],
        mode: [item?.mode ?? ('TAXI' as TransportMode), Validators.required],
        fromLocation: [item?.fromLocation ?? '', Validators.required],
        toLocation: [item?.toLocation ?? '', Validators.required],
        purpose: [item?.purpose ?? ''],
        amount: [item?.amount ?? '', [Validators.required, amountValidator(() => this.currency())]],
        receiptId: [item?.receiptId ?? ''],
      }),
    );
    this.items.markAsDirty();
  }

  protected removeItem(index: number): void {
    this.items.removeAt(index);
    this.items.markAsDirty();
  }

  protected async save(): Promise<void> {
    if (!this.validate()) return;
    await this.run(async () => {
      if (this.isNew()) {
        const created = versioned(
          await this.api.invoke$Response(createClaim, {
            'Idempotency-Key': this.createKey,
            body: this.payload(),
          }),
        );
        this.form.markAsPristine();
        this.createKey = newIdempotencyKey();
        this.notifier.success('claims.saved');
        await this.router.navigate(['/claims', created.data.id], { replaceUrl: true });
      } else {
        const updated = versioned(
          await this.api.invoke$Response(updateClaim, {
            claimId: this.claimId()!,
            'If-Match': this.etag,
            body: this.payload(),
          }),
        );
        this.apply(updated);
        this.notifier.success('claims.saved');
      }
    });
  }

  protected async submit(): Promise<void> {
    const claim = this.claim.value()?.data;
    if (!claim || this.form.dirty) return;
    const confirmed = await this.confirmation.ask({
      titleKey: 'claims.submitConfirm.title',
      bodyKey: 'claims.submitConfirm.body',
      confirmKey: 'claims.submit',
      params: { number: claim.number, total: this.formatTotal(claim) },
    });
    if (!confirmed) return;
    await this.run(async () => {
      try {
        this.apply(await this.submitter.submit(claim.id, this.etag));
        this.notifier.success('claims.submitted');
      } catch (error) {
        if (isApiError(error) && error.outcomeUnknown) {
          // The submit may have landed: read the claim before letting the user retry (FE-015).
          this.claim.reload();
          const latest = await this.api.invoke(getClaim, { claimId: claim.id });
          if (latest.status !== 'DRAFT' && latest.status !== 'NEEDS_CHANGES') {
            this.notifier.success('claims.submitted');
            return;
          }
        }
        if (isApiError(error) && error.code === 'CLAIM_HAS_BLOCKING_FINDINGS') this.claim.reload();
        throw error;
      }
    });
  }

  protected async discard(): Promise<void> {
    const claim = this.claim.value()?.data;
    if (!claim) return;
    const confirmed = await this.confirmation.ask({
      titleKey: 'claims.deleteConfirm.title',
      bodyKey: 'claims.deleteConfirm.body',
      confirmKey: 'claims.delete',
      params: { number: claim.number },
      destructive: true,
    });
    if (!confirmed) return;
    await this.run(async () => {
      await this.api.invoke(deleteClaim, { claimId: claim.id, 'If-Match': this.etag });
      this.form.markAsPristine();
      this.notifier.success('claims.deleted');
      await this.router.navigate(['/claims'], { replaceUrl: true });
    });
  }

  protected reloadLatest(): void {
    this.actionError.set(null);
    this.form.markAsPristine();
    this.claim.reload();
  }

  protected onReceiptsChanged(): void {
    this.claim.reload();
  }

  private formatTotal(claim: Claim): string {
    return formatMoney(claim.totalAmount, claim.currency, this.localeService.locale());
  }

  private isNewRoute(): boolean {
    // Inputs are not bound yet in the constructor; the create route has no :claimId segment.
    return /\/claims\/new(\?|$)/.test(this.router.url) || this.router.url.endsWith('/new');
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

  private payload(): ClaimWrite {
    const v = this.form.getRawValue();
    return {
      period: v.period,
      items: v.items.map((item) => ({
        tripDate: item.tripDate,
        mode: item.mode,
        fromLocation: item.fromLocation.trim(),
        toLocation: item.toLocation.trim(),
        purpose: item.purpose.trim() || null,
        amount: item.amount,
        receiptId: item.receiptId || null,
      })),
    };
  }

  private apply(result: Versioned<Claim>): void {
    this.etag = result.etag;
    this.claim.set(result);
    this.fill(result.data);
  }

  private fill(claim: Claim): void {
    this.items.clear();
    claim.items.forEach((item) => this.addItem(item));
    this.form.controls.period.setValue(claim.period);
    const canEdit = claim.allowedActions.includes('EDIT');
    if (canEdit) this.form.enable();
    else this.form.disable();
    this.form.markAsPristine();
    this.dirty.set(false);
  }
}
