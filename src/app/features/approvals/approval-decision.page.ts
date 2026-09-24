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
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatRadioButton, MatRadioGroup } from '@angular/material/radio';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Api } from '../../api/api';
import { decideApproval, getApproval, getApprovalReceiptUrl } from '../../api/functions';
import { ApprovalDecisionType, ApprovalView } from '../../api/models';
import { ApiError, isApiError } from '../../core/errors/api-error';
import { LocaleService } from '../../core/i18n/locale.service';
import { newIdempotencyKey, versioned, Versioned } from '../../core/http/versioned';
import { ClaimFindings } from '../../shared/claims/claim-findings';
import { ClaimItems } from '../../shared/claims/claim-items';
import { CLAIM_STATUS_TONES, formatPeriod } from '../../shared/claims/claim-status';
import { ClaimTimeline } from '../../shared/claims/claim-timeline';
import { openFileInNewTab } from '../../shared/files/file-links';
import { FieldErrorText } from '../../shared/forms/field-error';
import { applyServerErrors, focusFirstInvalid } from '../../shared/forms/server-errors';
import { HasUnsavedChanges } from '../../shared/forms/unsaved-changes.guard';
import { formatMoney, MoneyPipe } from '../../shared/format/money';
import { Confirmation } from '../../shared/ui/confirm-dialog';
import { ErrorAlert } from '../../shared/ui/error-alert';
import { Notifier } from '../../shared/ui/notifier';
import { StatusBadge } from '../../shared/ui/status-badge';

/** The ETag of an approval is the claim's version. */
const claimRevision = (view: ApprovalView) => view.claim.version;
const REASON_MAX = 1000;

/**
 * Decision page (V02). Shows the claim as submitted, with the findings recorded at submission,
 * and lets the assigned approver decide. A reason is required to reject or request changes.
 * The decision is sent with If-Match: if someone decided first, the page reloads and never
 * reports the stale decision as successful (FE-010).
 */
@Component({
  selector: 'app-approval-decision-page',
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
    MatRadioGroup,
    MatRadioButton,
    MatProgressBar,
    FieldErrorText,
    ErrorAlert,
    StatusBadge,
    MoneyPipe,
    ClaimFindings,
    ClaimItems,
    ClaimTimeline,
  ],
  templateUrl: './approval-decision.page.html',
  styleUrl: './approval-decision.page.scss',
})
export class ApprovalDecisionPage implements HasUnsavedChanges {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  private readonly confirmation = inject(Confirmation);
  private readonly localeService = inject(LocaleService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly claimId = input.required<string>();

  protected readonly tones = CLAIM_STATUS_TONES;
  protected readonly reasonMax = REASON_MAX;
  protected readonly approval = resource({
    params: () => this.claimId(),
    loader: async ({ params: claimId }): Promise<Versioned<ApprovalView>> =>
      versioned(await this.api.invoke$Response(getApproval, { claimId }), claimRevision),
  });

  protected readonly form = inject(FormBuilder).nonNullable.group({
    decision: ['' as ApprovalDecisionType | ''],
    reason: [''],
  });

  protected readonly canDecide = computed(
    () => (this.approval.value()?.data.allowedDecisions.length ?? 0) > 0,
  );
  protected readonly busy = signal(false);
  protected readonly actionError = signal<ApiError | null>(null);
  protected readonly conflict = computed(() =>
    [409, 412].includes(this.actionError()?.status ?? 0),
  );
  private decisionKey = newIdempotencyKey();

  hasUnsavedChanges(): boolean {
    return this.form.dirty && !this.busy() && this.canDecide();
  }

  protected period(value: string): string {
    return formatPeriod(value, this.localeService.locale());
  }

  protected reasonRequired(): boolean {
    const decision = this.form.controls.decision.value;
    return decision === 'REJECT' || decision === 'REQUEST_CHANGES';
  }

  protected async openReceipt(receiptId: string): Promise<void> {
    this.actionError.set(null);
    try {
      await openFileInNewTab(async () => {
        const link = await this.api.invoke(getApprovalReceiptUrl, {
          claimId: this.claimId(),
          receiptId,
        });
        return link.url;
      });
    } catch (error) {
      if (!isApiError(error)) throw error;
      this.actionError.set(error);
    }
  }

  protected async decide(): Promise<void> {
    const current = this.approval.value();
    if (!current || this.busy()) return;
    if (!this.validate()) return;
    const decision = this.form.controls.decision.value as ApprovalDecisionType;
    const claim = current.data.claim;
    const confirmed = await this.confirmation.ask({
      titleKey: `approvals.confirm.${decision}.title`,
      bodyKey: `approvals.confirm.${decision}.body`,
      confirmKey: `approvals.decisions.${decision}`,
      params: {
        number: claim.number,
        name: current.data.claimantName,
        total: formatMoney(claim.totalAmount, claim.currency, this.localeService.locale()),
      },
      destructive: decision === 'REJECT',
    });
    if (!confirmed) return;

    this.busy.set(true);
    this.actionError.set(null);
    try {
      await this.api.invoke(decideApproval, {
        claimId: claim.id,
        'If-Match': current.etag,
        'Idempotency-Key': this.decisionKey,
        body: { decision, reason: this.form.controls.reason.value.trim() || null },
      });
      this.decisionKey = newIdempotencyKey();
      this.form.markAsPristine();
      this.notifier.success(`approvals.done.${decision}`, { number: claim.number });
      await this.router.navigate(['/approvals']);
    } catch (error) {
      if (!isApiError(error)) throw error;
      // A definite answer ends this intent; only an unknown outcome keeps the key for retry.
      if (!error.outcomeUnknown) this.decisionKey = newIdempotencyKey();
      this.actionError.set(error);
      if (error.status === 409 || error.status === 412) this.approval.reload();
      if (applyServerErrors(this.form, error).length < error.fieldErrors.length) {
        focusFirstInvalid(this.host.nativeElement, this.injector);
      }
    } finally {
      this.busy.set(false);
    }
  }

  private validate(): boolean {
    const { decision, reason } = this.form.controls;
    decision.setErrors(decision.value ? null : { required: true });
    const text = reason.value.trim();
    if (this.reasonRequired() && !text) reason.setErrors({ required: true });
    else if (text.length > REASON_MAX)
      reason.setErrors({ maxlength: { requiredLength: REASON_MAX } });
    else reason.setErrors(null);
    if (decision.valid && reason.valid) return true;
    this.form.markAllAsTouched();
    focusFirstInvalid(this.host.nativeElement, this.injector);
    return false;
  }
}
