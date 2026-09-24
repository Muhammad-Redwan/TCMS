import { Component, computed, inject, resource } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatOption, MatSelect } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Api } from '../../api/api';
import { listMyClaims } from '../../api/functions';
import { ClaimStatus } from '../../api/models';
import { LocaleService } from '../../core/i18n/locale.service';
import { SessionService } from '../../core/session/session.service';
import { MoneyPipe } from '../../shared/format/money';
import { TenantDatePipe } from '../../shared/format/tenant-date.pipe';
import { ListQueryState, PAGE_SIZES } from '../../shared/table/list-query';
import { ErrorAlert } from '../../shared/ui/error-alert';
import { StatusBadge } from '../../shared/ui/status-badge';
import { CLAIM_STATUS_TONES, CLAIM_STATUSES, formatPeriod } from '../../shared/claims/claim-status';

/** My claims (C01). Totals shown are the server's; the client never adds amounts up. */
@Component({
  selector: 'app-claim-list-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    MatButton,
    MatFormField,
    MatLabel,
    MatSelect,
    MatOption,
    MatTableModule,
    MatPaginator,
    MatProgressBar,
    ErrorAlert,
    StatusBadge,
    MoneyPipe,
    TenantDatePipe,
  ],
  template: `
    <header class="page-header">
      <h1>{{ 'claims.title' | transloco }}</h1>
      @if (canCreate()) {
        <a matButton="filled" routerLink="new" data-testid="create-claim">
          {{ 'claims.create' | transloco }}
        </a>
      }
    </header>

    <div class="filters" role="search">
      <mat-form-field>
        <mat-label>{{ 'claims.fields.status' | transloco }}</mat-label>
        <mat-select
          [value]="list.query().filters['status'] ?? ''"
          (valueChange)="list.setFilter('status', $event)"
        >
          <mat-option value="">{{ 'common.all' | transloco }}</mat-option>
          @for (status of statuses; track status) {
            <mat-option [value]="status">{{ 'status.claim.' + status | transloco }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
    </div>

    @if (claims.isLoading()) {
      <mat-progress-bar mode="indeterminate" [attr.aria-label]="'common.loading' | transloco" />
    }

    @if (claims.error(); as error) {
      <app-error-alert [error]="error" [retryable]="true" (retry)="claims.reload()" />
    } @else if (claims.value(); as page) {
      @if (page.content.length === 0) {
        <p class="empty" data-testid="claims-empty">
          {{ (isFiltered() ? 'claims.emptyFiltered' : 'claims.empty') | transloco }}
        </p>
      } @else {
        <div class="table-scroll">
          <table mat-table [dataSource]="page.content" data-testid="claims-table">
            <caption class="visually-hidden">
              {{
                'claims.title' | transloco
              }}
            </caption>
            <ng-container matColumnDef="number">
              <th mat-header-cell *matHeaderCellDef>{{ 'claims.fields.number' | transloco }}</th>
              <td mat-cell *matCellDef="let c">
                <a [routerLink]="c.id"
                  ><bdi>{{ c.number }}</bdi></a
                >
              </td>
            </ng-container>
            <ng-container matColumnDef="period">
              <th mat-header-cell *matHeaderCellDef>{{ 'claims.fields.period' | transloco }}</th>
              <td mat-cell *matCellDef="let c">{{ period(c.period) }}</td>
            </ng-container>
            <ng-container matColumnDef="items">
              <th mat-header-cell *matHeaderCellDef>{{ 'claims.fields.trips' | transloco }}</th>
              <td mat-cell *matCellDef="let c">{{ c.itemCount }}</td>
            </ng-container>
            <ng-container matColumnDef="total">
              <th mat-header-cell *matHeaderCellDef>{{ 'claims.fields.total' | transloco }}</th>
              <td mat-cell *matCellDef="let c" class="amount">
                <bdi>{{ c.totalAmount | money: c.currency }}</bdi>
              </td>
            </ng-container>
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>{{ 'claims.fields.status' | transloco }}</th>
              <td mat-cell *matCellDef="let c">
                <app-status-badge namespace="status.claim" [value]="c.status" [tones]="tones" />
              </td>
            </ng-container>
            <ng-container matColumnDef="updatedAt">
              <th mat-header-cell *matHeaderCellDef>{{ 'claims.fields.updatedAt' | transloco }}</th>
              <td mat-cell *matCellDef="let c">{{ c.updatedAt | tenantDate }}</td>
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
    .filters {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      margin-block-end: 1rem;
      mat-form-field {
        flex: 0 1 16rem;
      }
    }
    .empty {
      color: var(--mat-sys-on-surface-variant);
    }
    .amount {
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class ClaimListPage {
  private readonly api = inject(Api);
  private readonly session = inject(SessionService);
  private readonly locale = inject(LocaleService);
  protected readonly list = new ListQueryState(['status']);

  protected readonly columns = ['number', 'period', 'items', 'total', 'status', 'updatedAt'];
  protected readonly statuses = CLAIM_STATUSES;
  protected readonly tones = CLAIM_STATUS_TONES;
  protected readonly pageSizes = PAGE_SIZES;
  protected readonly canCreate = computed(() => this.session.permissions().has('claims.create'));
  protected readonly isFiltered = computed(() => Object.keys(this.list.query().filters).length > 0);

  protected readonly claims = resource({
    params: () => this.list.query(),
    loader: ({ params }) =>
      this.api.invoke(listMyClaims, {
        page: params.page,
        size: params.size,
        status: params.filters['status'] as ClaimStatus | undefined,
      }),
  });

  protected period(value: string): string {
    return formatPeriod(value, this.locale.locale());
  }

  protected onPage(event: PageEvent): void {
    this.list.setPage(event.pageIndex, event.pageSize);
  }
}
