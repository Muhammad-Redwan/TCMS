import { Component, computed, DestroyRef, inject, OnInit, resource } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
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
import { listUsers } from '../../api/functions';
import { UserStatus } from '../../api/models';
import { ListQueryState, PAGE_SIZES } from '../../shared/table/list-query';
import { ErrorAlert } from '../../shared/ui/error-alert';
import { StatusBadge } from '../../shared/ui/status-badge';
import { USER_STATUS_TONES } from './user-status';

/** Users (I01 list). Users sign in through Keycloak; roles are assigned here. */
@Component({
  selector: 'app-user-list-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
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
  ],
  template: `
    <h1>{{ 'users.title' | transloco }}</h1>

    <div class="filters" role="search">
      <mat-form-field>
        <mat-label>{{ 'users.search' | transloco }}</mat-label>
        <input matInput type="search" [formControl]="search" />
      </mat-form-field>
      <mat-form-field>
        <mat-label>{{ 'users.fields.status' | transloco }}</mat-label>
        <mat-select
          [value]="list.query().filters['status'] ?? ''"
          (valueChange)="list.setFilter('status', $event)"
        >
          <mat-option value="">{{ 'common.all' | transloco }}</mat-option>
          @for (status of statuses; track status) {
            <mat-option [value]="status">{{ 'status.user.' + status | transloco }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
    </div>

    @if (users.isLoading()) {
      <mat-progress-bar mode="indeterminate" [attr.aria-label]="'common.loading' | transloco" />
    }

    @if (users.error(); as error) {
      <app-error-alert [error]="error" [retryable]="true" (retry)="users.reload()" />
    } @else if (users.value(); as page) {
      @if (page.content.length === 0) {
        <p class="empty">
          {{ (isFiltered() ? 'users.emptyFiltered' : 'users.empty') | transloco }}
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
            data-testid="users-table"
          >
            <caption class="visually-hidden">
              {{
                'users.title' | transloco
              }}
            </caption>
            <ng-container matColumnDef="displayName">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>
                {{ 'users.fields.displayName' | transloco }}
              </th>
              <td mat-cell *matCellDef="let u">
                <a [routerLink]="u.id"
                  ><bdi>{{ u.displayName }}</bdi></a
                >
              </td>
            </ng-container>
            <ng-container matColumnDef="email">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>
                {{ 'users.fields.email' | transloco }}
              </th>
              <td mat-cell *matCellDef="let u">
                <bdi>{{ u.email }}</bdi>
              </td>
            </ng-container>
            <ng-container matColumnDef="roles">
              <th mat-header-cell *matHeaderCellDef>{{ 'users.fields.roles' | transloco }}</th>
              <td mat-cell *matCellDef="let u">
                @for (role of u.roles; track role; let last = $last) {
                  {{ 'roles.' + role | transloco
                  }}{{ last ? '' : ('common.listSeparator' | transloco) }}
                }
              </td>
            </ng-container>
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>
                {{ 'users.fields.status' | transloco }}
              </th>
              <td mat-cell *matCellDef="let u">
                <app-status-badge namespace="status.user" [value]="u.status" [tones]="tones" />
              </td>
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
export class UserListPage implements OnInit {
  private readonly api = inject(Api);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly list = new ListQueryState(['status']);

  protected readonly columns = ['displayName', 'email', 'roles', 'status'];
  protected readonly statuses: UserStatus[] = ['ACTIVE', 'INVITED', 'DISABLED'];
  protected readonly tones = USER_STATUS_TONES;
  protected readonly pageSizes = PAGE_SIZES;
  protected readonly search = new FormControl(this.list.query().q ?? '', { nonNullable: true });

  protected readonly users = resource({
    params: () => this.list.query(),
    loader: ({ params }) =>
      this.api.invoke(listUsers, {
        page: params.page,
        size: params.size,
        sort: params.sort,
        q: params.q,
        status: params.filters['status'] as UserStatus | undefined,
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
