import { Component, inject, input, output, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatProgressBar } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Api } from '../../api/api';
import { deleteReceipt } from '../../api/functions';
import { Receipt, ReceiptUploadPolicy } from '../../api/models';
import { isApiError } from '../../core/errors/api-error';
import { Confirmation } from '../../shared/ui/confirm-dialog';
import { StatusBadge } from '../../shared/ui/status-badge';
import { SCAN_STATUS_TONES } from '../../shared/claims/claim-status';
import { precheck, ReceiptUploader, StorageUploadError } from './receipt-upload';

interface PendingUpload {
  id: number;
  fileName: string;
  progress: number;
  /** Translation key of the reason the file was not attached. */
  errorKey: string | null;
}

let nextUploadId = 1;

/**
 * Receipts of one claim (C02/C03). Files failing the pre-check are listed with the reason and
 * are never uploaded or shown as attached (FE-005). Scan status comes from the server.
 */
@Component({
  selector: 'app-receipts-panel',
  imports: [RouterLink, TranslocoPipe, MatButton, MatProgressBar, StatusBadge],
  template: `
    <section class="receipts" aria-labelledby="receipts-heading">
      <h2 id="receipts-heading">{{ 'claims.receipts.title' | transloco }}</h2>

      @if (editable()) {
        <div
          class="drop"
          [class.over]="dragOver()"
          (dragover)="$event.preventDefault(); dragOver.set(true)"
          (dragleave)="dragOver.set(false)"
          (drop)="onDrop($event)"
        >
          <p>{{ 'claims.receipts.drop' | transloco }}</p>
          <button matButton="outlined" type="button" (click)="fileInput.click()">
            {{ 'claims.receipts.choose' | transloco }}
          </button>
          <input
            #fileInput
            type="file"
            multiple
            hidden
            [accept]="policy().allowedContentTypes.join(',')"
            (change)="onPick(fileInput)"
            data-testid="receipt-input"
          />
          <p class="hint">
            {{
              'claims.receipts.limits'
                | transloco: { size: maxSizeMb(), count: policy().maxReceiptsPerClaim }
            }}
          </p>
        </div>
      }

      @if (pending().length > 0) {
        <ul class="pending" aria-live="polite">
          @for (upload of pending(); track upload.id) {
            <li [attr.data-testid]="'pending-' + upload.fileName">
              <bdi class="name">{{ upload.fileName }}</bdi>
              @if (upload.errorKey) {
                <span class="rejected" role="alert">{{ upload.errorKey | transloco }}</span>
                <button matButton type="button" (click)="dismiss(upload.id)">
                  {{ 'common.close' | transloco }}
                </button>
              } @else {
                <mat-progress-bar
                  mode="determinate"
                  [value]="upload.progress"
                  [attr.aria-label]="upload.fileName"
                />
              }
            </li>
          }
        </ul>
      }

      @if (receipts().length === 0) {
        <p class="empty">{{ 'claims.receipts.empty' | transloco }}</p>
      } @else {
        <ul class="list" data-testid="receipts-list">
          @for (receipt of receipts(); track receipt.id) {
            <li>
              <a [routerLink]="['receipts', receipt.id]"
                ><bdi>{{ receipt.fileName }}</bdi></a
              >
              <span class="size">{{ sizeKb(receipt.sizeBytes) }} KB</span>
              <app-status-badge
                namespace="status.scan"
                [value]="receipt.scanStatus"
                [tones]="scanTones"
              />
              @if (receipt.rejectionCode) {
                <span class="rejected">{{
                  'claims.receipts.rejection.' + receipt.rejectionCode | transloco
                }}</span>
              }
              @if (receipt.duplicateOfClaimNumber) {
                <span class="duplicate">
                  {{
                    'claims.receipts.duplicate'
                      | transloco: { claimNumber: receipt.duplicateOfClaimNumber }
                  }}
                </span>
              }
              @if (editable()) {
                <button
                  matButton
                  type="button"
                  (click)="remove(receipt)"
                  [attr.aria-label]="
                    ('claims.receipts.remove' | transloco) + ' ' + receipt.fileName
                  "
                >
                  {{ 'claims.receipts.remove' | transloco }}
                </button>
              }
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: `
    h2 {
      font-size: 1rem;
      margin: 1.5rem 0 0.5rem;
    }
    .drop {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem 1rem;
      padding: 1rem;
      border: 2px dashed var(--mat-sys-outline-variant);
      border-radius: var(--mat-sys-corner-medium);
      p {
        margin: 0;
      }
      &.over {
        border-color: var(--mat-sys-primary);
        background: var(--mat-sys-primary-container);
      }
    }
    .hint,
    .empty,
    .size {
      color: var(--mat-sys-on-surface-variant);
      font-size: 0.875rem;
    }
    .hint {
      flex-basis: 100%;
    }
    ul {
      list-style: none;
      margin: 0.75rem 0 0;
      padding: 0;
      display: grid;
      gap: 0.5rem;
    }
    li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.25rem 0.75rem;
    }
    .pending mat-progress-bar {
      flex: 1 1 10rem;
    }
    .name {
      font-weight: 500;
    }
    .rejected {
      color: var(--mat-sys-error);
    }
    .duplicate {
      color: #6b4a00;
    }
  `,
})
export class ReceiptsPanel {
  private readonly uploader = inject(ReceiptUploader);
  private readonly api = inject(Api);
  private readonly confirmation = inject(Confirmation);

  readonly claimId = input.required<string>();
  readonly receipts = input.required<Receipt[]>();
  readonly policy = input.required<ReceiptUploadPolicy>();
  readonly editable = input(false);
  /** Emitted after an upload or removal so the page re-reads the claim. */
  readonly changed = output<void>();

  protected readonly scanTones = SCAN_STATUS_TONES;
  protected readonly pending = signal<PendingUpload[]>([]);
  protected readonly dragOver = signal(false);

  protected maxSizeMb(): string {
    return (this.policy().maxFileSizeBytes / (1024 * 1024)).toFixed(0);
  }

  protected sizeKb(bytes: number): string {
    return Math.max(1, Math.round(bytes / 1024)).toString();
  }

  protected onPick(input: HTMLInputElement): void {
    const files = Array.from(input.files ?? []);
    input.value = '';
    void this.uploadAll(files);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    void this.uploadAll(Array.from(event.dataTransfer?.files ?? []));
  }

  protected dismiss(id: number): void {
    this.pending.update((list) => list.filter((u) => u.id !== id));
  }

  protected async remove(receipt: Receipt): Promise<void> {
    const confirmed = await this.confirmation.ask({
      titleKey: 'claims.receipts.removeConfirm.title',
      bodyKey: 'claims.receipts.removeConfirm.body',
      confirmKey: 'claims.receipts.remove',
      params: { fileName: receipt.fileName },
      destructive: true,
    });
    if (!confirmed) return;
    await this.api.invoke(deleteReceipt, { claimId: this.claimId(), receiptId: receipt.id });
    this.changed.emit();
  }

  private async uploadAll(files: File[]): Promise<void> {
    let attached = this.receipts().length;
    const uploads: Promise<void>[] = [];
    for (const file of files) {
      const upload: PendingUpload = {
        id: nextUploadId++,
        fileName: file.name,
        progress: 0,
        errorKey: null,
      };
      const rejection = precheck(file, this.policy(), attached);
      if (rejection) {
        this.pending.update((list) => [
          ...list,
          { ...upload, errorKey: `claims.receipts.precheck.${rejection}` },
        ]);
        continue;
      }
      attached += 1;
      this.pending.update((list) => [...list, upload]);
      uploads.push(this.uploadOne(file, upload.id));
    }
    await Promise.all(uploads);
    if (uploads.length) this.changed.emit();
  }

  private async uploadOne(file: File, id: number): Promise<void> {
    const setProgress = (progress: number) =>
      this.pending.update((list) => list.map((u) => (u.id === id ? { ...u, progress } : u)));
    try {
      await this.uploader.upload(this.claimId(), file, setProgress);
      this.dismiss(id);
    } catch (error) {
      const errorKey =
        error instanceof StorageUploadError
          ? 'claims.receipts.storageFailed'
          : isApiError(error)
            ? `errors.${error.code}`
            : 'errors.UNKNOWN_ERROR';
      this.pending.update((list) => list.map((u) => (u.id === id ? { ...u, errorKey } : u)));
    }
  }
}
