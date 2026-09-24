import { Component, computed, inject, resource, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Api } from '../../api/api';
import { createSettlementBatch, listSettlementQueue } from '../../api/functions';
import { SettlementCandidate } from '../../api/models';
import { ApiError, isApiError } from '../../core/errors/api-error';
import { LocaleService } from '../../core/i18n/locale.service';
import { newIdempotencyKey } from '../../core/http/versioned';
import { SessionService } from '../../core/session/session.service';
import { formatPeriod } from '../../shared/claims/claim-status';
import { MoneyPipe } from '../../shared/format/money';
import { TenantDatePipe } from '../../shared/format/tenant-date.pipe';
import { ListQueryState, PAGE_SIZES } from '../../shared/table/list-query';
import { Confirmation } from '../../shared/ui/confirm-dialog';
import { ErrorAlert } from '../../shared/ui/error-alert';
import { Notifier } from '../../shared/ui/notifier';

/**
 * Approved claims waiting for settlement (F01). Finance selects claims and creates a batch;
 * the batch total is calculated by the server, so the page only counts the selection.
 */
@Component({
  selector: 'app-settlement-queue-page',
  imports: [
    TranslocoPipe,
    MatButton,
    MatCheckbox,
    MatTableModule,
    MatPaginator,
    MatProgressBar,
    ErrorAlert,
    MoneyPipe,
    TenantDatePipe,
  ],
  template: `
    @if (queue.isLoading()) {
      <mat-progress-bar mode="indeterminate" [attr.aria-label]="'common.loading' | transloco" />
    }
    @if (createError(); as error) {
      <app-error-alert [error]="error" />
    }

    @if (queue.error(); as error) {
      <app-error-alert [error]="error" [retryable]="true" (retry)="queue.reload()" />
    } @else if (queue.value(); as page) {
      @if (page.content.length === 0) {
        <p class="empty" data-testid="queue-empty">{{ 'finance.queueEmpty' | transloco }}</p>
      } @else {
        <div class="toolbar">
          <span role="status" data-testid="selection-count">
            {{ 'finance.selected' | transloco: { count: selected().size } }}
          </span>
          @if (canBatch()) {
            <button
              matButton="filled"
              type="button"
              [disabled]="selected().size === 0 || busy()"
              (click)="createBatch()"
              data-testid="create-batch"
            >
              {{ 'finance.createBatch' | transloco }}
            </button>
          }
        </div>
        <div class="table-scroll">
          <table mat-table [dataSource]="page.content" data-testid="queue-table">
            <caption class="visually-hidden">
              {{
                'finance.queue' | transloco
              }}
            </caption>
            <ng-container matColumnDef="select">
              <th mat-header-cell *matHeaderCellDef>
                <mat-checkbox
                  [checked]="allSelected(page.content)"
                  [indeterminate]="someSelected(page.content)"
                  (change)="toggleAll(page.content, $event.checked)"
                  [aria-label]="'finance.selectAll' | transloco"
                  data-testid="select-all"
                />
              </th>
              <td mat-cell *matCellDef="let c">
                <mat-checkbox
                  [checked]="selected().has(c.claimId)"
                  (change)="toggle(c.claimId, $event.checked)"
                  [aria-label]="c.claimNumber"
                  [attr.data-testid]="'select-' + c.claimNumber"
                />
              </td>
            </ng-container>
            <ng-container matColumnDef="claim">
              <th mat-header-cell *matHeaderCellDef>{{ 'claims.fields.number' | transloco }}</th>
              <td mat-cell *matCellDef="let c">
                <bdi>{{ c.claimNumber }}</bdi>
              </td>
            </ng-container>
            <ng-container matColumnDef="claimant">
              <th mat-header-cell *matHeaderCellDef>{{ 'approvals.claimant' | transloco }}</th>
              <td mat-cell *matCellDef="let c">
                <bdi>{{ c.claimantName }}</bdi>
              </td>
            </ng-container>
            <ng-container matColumnDef="period">
              <th mat-header-cell *matHeaderCellDef>{{ 'claims.fields.period' | transloco }}</th>
              <td mat-cell *matCellDef="let c">{{ period(c.period) }}</td>
            </ng-container>
            <ng-container matColumnDef="total">
              <th mat-header-cell *matHeaderCellDef>{{ 'claims.fields.total' | transloco }}</th>
              <td mat-cell *matCellDef="let c" class="amount">
                <bdi>{{ c.totalAmount | money: c.currency }}</bdi>
              </td>
            </ng-container>
            <ng-container matColumnDef="approvedAt">
              <th mat-header-cell *matHeaderCellDef>{{ 'finance.approvedAt' | transloco }}</th>
              <td mat-cell *matCellDef="let c">{{ c.approvedAt | tenantDate }}</td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns"></tr>
          </table>
        </div>
        <mat-paginator
          [length]="page.page.totalElements"
          [pageIndex]="page.page.number"
          [pageSize]="page.page.size"
          [pageSizeOptions]="pageSizes"
          (page)="onPage($event)"
        />
      }
    }
  `,
  styles: `
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      margin-block-end: 0.75rem;
    }
    .empty {
      color: var(--mat-sys-on-surface-variant);
    }
    .amount {
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class SettlementQueuePage {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly confirmation = inject(Confirmation);
  private readonly notifier = inject(Notifier);
  private readonly locale = inject(LocaleService);
  private readonly session = inject(SessionService);
  protected readonly list = new ListQueryState();

  protected readonly columns = ['select', 'claim', 'claimant', 'period', 'total', 'approvedAt'];
  protected readonly pageSizes = PAGE_SIZES;
  protected readonly canBatch = computed(() =>
    this.session.permissions().has('settlements.export'),
  );
  protected readonly queue = resource({
    params: () => this.list.query(),
    loader: ({ params }) =>
      this.api.invoke(listSettlementQueue, { page: params.page, size: params.size }),
  });

  protected readonly selected = signal(new Set<string>());
  protected readonly busy = signal(false);
  protected readonly createError = signal<ApiError | null>(null);
  private createKey = newIdempotencyKey();

  protected period(value: string): string {
    return formatPeriod(value, this.locale.locale());
  }

  protected toggle(claimId: string, checked: boolean): void {
    this.selected.update((set) => {
      const next = new Set(set);
      if (checked) next.add(claimId);
      else next.delete(claimId);
      return next;
    });
    // A different selection is a different intent.
    this.createKey = newIdempotencyKey();
  }

  protected allSelected(rows: SettlementCandidate[]): boolean {
    return rows.length > 0 && rows.every((r) => this.selected().has(r.claimId));
  }

  protected someSelected(rows: SettlementCandidate[]): boolean {
    return rows.some((r) => this.selected().has(r.claimId)) && !this.allSelected(rows);
  }

  protected toggleAll(rows: SettlementCandidate[], checked: boolean): void {
    rows.forEach((r) => this.toggle(r.claimId, checked));
  }

  protected onPage(event: PageEvent): void {
    this.list.setPage(event.pageIndex, event.pageSize);
  }

  protected async createBatch(): Promise<void> {
    const count = this.selected().size;
    if (count === 0 || this.busy()) return;
    const confirmed = await this.confirmation.ask({
      titleKey: 'finance.createConfirm.title',
      bodyKey: 'finance.createConfirm.body',
      confirmKey: 'finance.createBatch',
      params: { count },
    });
    if (!confirmed) return;
    this.busy.set(true);
    this.createError.set(null);
    try {
      const batch = await this.api.invoke(createSettlementBatch, {
        'Idempotency-Key': this.createKey,
        body: { claimIds: [...this.selected()] },
      });
      this.createKey = newIdempotencyKey();
      this.selected.set(new Set());
      this.notifier.success('finance.batchCreated', { number: batch.number });
      await this.router.navigate(['/finance/settlements/batches', batch.id]);
    } catch (error) {
      if (!isApiError(error)) throw error;
      this.createError.set(error);
      if (!error.outcomeUnknown) this.createKey = newIdempotencyKey();
      // Someone else batched some of these claims meanwhile: show the current queue.
      if (error.status === 409) {
        this.selected.set(new Set());
        this.queue.reload();
      }
    } finally {
      this.busy.set(false);
    }
  }
}
