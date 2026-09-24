import { Component, inject, resource } from '@angular/core';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Api } from '../../api/api';
import { listSettlementBatches } from '../../api/functions';
import { MoneyPipe } from '../../shared/format/money';
import { TenantDatePipe } from '../../shared/format/tenant-date.pipe';
import { ListQueryState, PAGE_SIZES } from '../../shared/table/list-query';
import { ErrorAlert } from '../../shared/ui/error-alert';
import { StatusBadge } from '../../shared/ui/status-badge';
import { BATCH_STATUS_TONES } from './batch-status';

/** Settlement batches, newest first (F02 list). */
@Component({
  selector: 'app-batch-list-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    MatTableModule,
    MatPaginator,
    MatProgressBar,
    ErrorAlert,
    StatusBadge,
    MoneyPipe,
    TenantDatePipe,
  ],
  template: `
    @if (batches.isLoading()) {
      <mat-progress-bar mode="indeterminate" [attr.aria-label]="'common.loading' | transloco" />
    }
    @if (batches.error(); as error) {
      <app-error-alert [error]="error" [retryable]="true" (retry)="batches.reload()" />
    } @else if (batches.value(); as page) {
      @if (page.content.length === 0) {
        <p class="empty">{{ 'finance.batchesEmpty' | transloco }}</p>
      } @else {
        <div class="table-scroll">
          <table mat-table [dataSource]="page.content" data-testid="batches-table">
            <caption class="visually-hidden">
              {{
                'finance.batches' | transloco
              }}
            </caption>
            <ng-container matColumnDef="number">
              <th mat-header-cell *matHeaderCellDef>{{ 'finance.batch' | transloco }}</th>
              <td mat-cell *matCellDef="let b">
                <a [routerLink]="b.id"
                  ><bdi>{{ b.number }}</bdi></a
                >
              </td>
            </ng-container>
            <ng-container matColumnDef="count">
              <th mat-header-cell *matHeaderCellDef>{{ 'finance.claimCount' | transloco }}</th>
              <td mat-cell *matCellDef="let b">{{ b.claimCount }}</td>
            </ng-container>
            <ng-container matColumnDef="total">
              <th mat-header-cell *matHeaderCellDef>{{ 'claims.fields.total' | transloco }}</th>
              <td mat-cell *matCellDef="let b" class="amount">
                <bdi>{{ b.totalAmount | money: b.currency }}</bdi>
              </td>
            </ng-container>
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>{{ 'claims.fields.status' | transloco }}</th>
              <td mat-cell *matCellDef="let b">
                <app-status-badge namespace="status.batch" [value]="b.status" [tones]="tones" />
              </td>
            </ng-container>
            <ng-container matColumnDef="createdAt">
              <th mat-header-cell *matHeaderCellDef>{{ 'finance.createdAt' | transloco }}</th>
              <td mat-cell *matCellDef="let b">{{ b.createdAt | tenantDate }}</td>
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
    .empty {
      color: var(--mat-sys-on-surface-variant);
    }
    .amount {
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class BatchListPage {
  private readonly api = inject(Api);
  protected readonly list = new ListQueryState();
  protected readonly columns = ['number', 'count', 'total', 'status', 'createdAt'];
  protected readonly tones = BATCH_STATUS_TONES;
  protected readonly pageSizes = PAGE_SIZES;
  protected readonly batches = resource({
    params: () => this.list.query(),
    loader: ({ params }) =>
      this.api.invoke(listSettlementBatches, { page: params.page, size: params.size }),
  });

  protected onPage(event: PageEvent): void {
    this.list.setPage(event.pageIndex, event.pageSize);
  }
}
