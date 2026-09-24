import { Component, computed, inject, input, resource } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatProgressBar } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Api } from '../../api/api';
import { getReceipt, getReceiptDownloadUrl } from '../../api/functions';
import { TenantDatePipe } from '../../shared/format/tenant-date.pipe';
import { ErrorAlert } from '../../shared/ui/error-alert';
import { StatusBadge } from '../../shared/ui/status-badge';
import { SCAN_STATUS_TONES } from './claim-status';

/** Formats the browser can show inline safely; everything else is download-only. */
const PREVIEWABLE = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Receipt detail (C04). Only CLEAN receipts get a download URL, which is short-lived and issued
 * after authorization. Images preview inline; PDFs open in a new tab rather than being embedded.
 * Captured-field corrections arrive with OCR in a later phase.
 */
@Component({
  selector: 'app-receipt-detail-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    MatButton,
    MatProgressBar,
    ErrorAlert,
    StatusBadge,
    TenantDatePipe,
  ],
  template: `
    <nav class="breadcrumb">
      <a routerLink="/claims">{{ 'claims.title' | transloco }}</a> ›
      <a [routerLink]="['/claims', claimId()]">{{ 'claims.receipts.backToClaim' | transloco }}</a>
    </nav>

    @if (receipt.error(); as error) {
      <app-error-alert [error]="error" [retryable]="true" (retry)="receipt.reload()" />
    } @else if (receipt.value(); as r) {
      <header class="page-header">
        <h1>
          <bdi>{{ r.fileName }}</bdi>
        </h1>
        <app-status-badge
          namespace="status.scan"
          [value]="r.scanStatus"
          [tones]="tones"
          data-testid="scan-status"
        />
      </header>

      <dl class="details">
        <dt>{{ 'claims.receipts.type' | transloco }}</dt>
        <dd>
          <span dir="ltr">{{ r.contentType }}</span>
        </dd>
        <dt>{{ 'claims.receipts.size' | transloco }}</dt>
        <dd>{{ sizeKb(r.sizeBytes) }} KB</dd>
        <dt>{{ 'claims.receipts.uploadedAt' | transloco }}</dt>
        <dd>{{ r.uploadedAt | tenantDate }}</dd>
      </dl>

      @if (r.rejectionCode) {
        <p class="rejected" role="alert">
          {{ 'claims.receipts.rejection.' + r.rejectionCode | transloco }}
        </p>
      }
      @if (r.duplicateOfClaimNumber) {
        <p class="duplicate">
          {{ 'claims.receipts.duplicate' | transloco: { claimNumber: r.duplicateOfClaimNumber } }}
        </p>
      }

      @if (r.scanStatus === 'CLEAN') {
        @if (download.value(); as link) {
          @if (previewable()) {
            <img
              class="preview"
              [src]="link.url"
              [alt]="r.fileName"
              data-testid="receipt-preview"
            />
          }
          <a
            matButton="outlined"
            [href]="link.url"
            target="_blank"
            rel="noopener"
            data-testid="receipt-open"
          >
            {{ 'claims.receipts.open' | transloco }}
          </a>
        } @else if (download.error(); as error) {
          <app-error-alert [error]="error" [retryable]="true" (retry)="download.reload()" />
        } @else {
          <mat-progress-bar mode="indeterminate" [attr.aria-label]="'common.loading' | transloco" />
        }
      } @else if (r.scanStatus === 'SCANNING') {
        <p class="muted">{{ 'claims.receipts.scanningHint' | transloco }}</p>
      }
    } @else {
      <mat-progress-bar mode="indeterminate" [attr.aria-label]="'common.loading' | transloco" />
    }
  `,
  styles: `
    .details {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 0.5rem 1.5rem;
      dt {
        color: var(--mat-sys-on-surface-variant);
      }
      dd {
        margin: 0;
      }
    }
    .preview {
      display: block;
      max-width: min(40rem, 100%);
      max-height: 70vh;
      margin-block: 1rem;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: var(--mat-sys-corner-small);
    }
    .rejected {
      color: var(--mat-sys-error);
    }
    .duplicate {
      color: #6b4a00;
    }
    .muted {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class ReceiptDetailPage {
  private readonly api = inject(Api);

  readonly claimId = input.required<string>();
  readonly receiptId = input.required<string>();

  protected readonly tones = SCAN_STATUS_TONES;
  protected readonly receipt = resource({
    params: () => ({ claimId: this.claimId(), receiptId: this.receiptId() }),
    loader: ({ params }) => this.api.invoke(getReceipt, params),
  });
  protected readonly download = resource({
    params: () =>
      this.receipt.value()?.scanStatus === 'CLEAN'
        ? { claimId: this.claimId(), receiptId: this.receiptId() }
        : undefined,
    loader: ({ params }) => this.api.invoke(getReceiptDownloadUrl, params),
  });
  protected readonly previewable = computed(() =>
    PREVIEWABLE.includes(this.receipt.value()?.contentType ?? ''),
  );

  protected sizeKb(bytes: number): string {
    return Math.max(1, Math.round(bytes / 1024)).toString();
  }
}
