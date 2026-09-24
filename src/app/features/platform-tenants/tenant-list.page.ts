import { Component, computed, DestroyRef, inject, OnInit, resource } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatOption, MatSelect } from '@angular/material/select';
import { MatSort, MatSortHeader, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { Api } from '../../api/api';
import { listTenants } from '../../api/functions';
import { TenantStatus } from '../../api/models';
import { SessionService } from '../../core/session/session.service';
import { TenantDatePipe } from '../../shared/format/tenant-date.pipe';
import { ListQueryState, PAGE_SIZES } from '../../shared/table/list-query';
import { ErrorAlert } from '../../shared/ui/error-alert';
import { StatusBadge } from '../../shared/ui/status-badge';
import { TENANT_STATUS_TONES } from './tenant-status';

/** Tenant list (T01), platform operators only. */
@Component({
  selector: 'app-tenant-list-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
    MatButton,
    MatFormField,
    MatLabel,
    MatInput,
    MatSelect,
    MatOption,
    MatTableModule,
    MatSort,
    MatSortHeader,
    MatPaginator,
    MatProgressBar,
    ErrorAlert,
    StatusBadge,
    TenantDatePipe,
  ],
  template: `
    <header class="page-header">
      <h1>{{ 'tenants.title' | transloco }}</h1>
      @if (canCreate()) {
        <a matButton="filled" routerLink="new" data-testid="create-tenant">{{
          'tenants.create' | transloco
        }}</a>
      }
    </header>

    <div class="filters" role="search">
      <mat-form-field>
        <mat-label>{{ 'tenants.search' | transloco }}</mat-label>
        <input matInput type="search" [formControl]="search" />
      </mat-form-field>
      <mat-form-field>
        <mat-label>{{ 'tenants.fields.status' | transloco }}</mat-label>
        <mat-select
          [value]="list.query().filters['status'] ?? ''"
          (valueChange)="list.setFilter('status', $event)"
        >
          <mat-option value="">{{ 'common.all' | transloco }}</mat-option>
          @for (status of statuses; track status) {
            <mat-option [value]="status">{{ 'status.tenant.' + status | transloco }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
    </div>

    @if (tenants.isLoading()) {
      <mat-progress-bar mode="indeterminate" [attr.aria-label]="'common.loading' | transloco" />
    }

    @if (tenants.error(); as error) {
      <app-error-alert [error]="error" [retryable]="true" (retry)="tenants.reload()" />
    } @else if (tenants.value(); as page) {
      @if (page.content.length === 0) {
        <p class="empty">
          {{ (isFiltered() ? 'tenants.emptyFiltered' : 'tenants.empty') | transloco }}
        </p>
      } @else {
        <div class="table-scroll">
          <table
            mat-table
            [dataSource]="page.content"
            matSort
            [matSortActive]="sortState().active"
            [matSortDirection]="sortState().direction"
            (matSortChange)="onSort($event)"
            data-testid="tenants-table"
          >
            <caption class="visually-hidden">
              {{
                'tenants.title' | transloco
              }}
            </caption>
            <ng-container matColumnDef="displayName">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>
                {{ 'tenants.fields.displayName' | transloco }}
              </th>
              <td mat-cell *matCellDef="let t">
                <a [routerLink]="t.id"
                  ><bdi>{{ t.displayName }}</bdi></a
                >
              </td>
            </ng-container>
            <ng-container matColumnDef="adminEmail">
              <th mat-header-cell *matHeaderCellDef>
                {{ 'tenants.fields.adminEmail' | transloco }}
              </th>
              <td mat-cell *matCellDef="let t">
                <bdi>{{ t.adminEmail }}</bdi>
              </td>
            </ng-container>
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>
                {{ 'tenants.fields.status' | transloco }}
              </th>
              <td mat-cell *matCellDef="let t">
                <app-status-badge namespace="status.tenant" [value]="t.status" [tones]="tones" />
              </td>
            </ng-container>
            <ng-container matColumnDef="createdAt">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>
                {{ 'tenants.fields.createdAt' | transloco }}
              </th>
              <td mat-cell *matCellDef="let t">{{ t.createdAt | tenantDate: 'date' }}</td>
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
        flex: 1 1 12rem;
      }
    }
    .empty {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class TenantListPage implements OnInit {
  private readonly api = inject(Api);
  private readonly destroyRef = inject(DestroyRef);
  private readonly session = inject(SessionService);
  protected readonly list = new ListQueryState(['status']);

  protected readonly columns = ['displayName', 'adminEmail', 'status', 'createdAt'];
  protected readonly statuses: TenantStatus[] = ['PROVISIONING', 'READY', 'FAILED'];
  protected readonly tones = TENANT_STATUS_TONES;
  protected readonly pageSizes = PAGE_SIZES;
  protected readonly search = new FormControl(this.list.query().q ?? '', { nonNullable: true });
  protected readonly canCreate = computed(() =>
    this.session.permissions().has('platform.tenants.write'),
  );

  protected readonly tenants = resource({
    params: () => this.list.query(),
    loader: ({ params }) =>
      this.api.invoke(listTenants, {
        page: params.page,
        size: params.size,
        sort: params.sort ?? 'createdAt,desc',
        q: params.q,
        status: params.filters['status'] as TenantStatus | undefined,
      }),
  });

  protected readonly sortState = computed(() => {
    const [active = '', direction = ''] = (this.list.query().sort ?? '').split(',');
    return { active, direction: direction as 'asc' | 'desc' | '' };
  });
  protected readonly isFiltered = computed(
    () => !!this.list.query().q || Object.keys(this.list.query().filters).length > 0,
  );

  ngOnInit(): void {
    this.search.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((q) => this.list.setSearch(q));
  }

  protected onSort(sort: Sort): void {
    this.list.setSort(sort.active, sort.direction);
  }

  protected onPage(event: PageEvent): void {
    this.list.setPage(event.pageIndex, event.pageSize);
  }
}
