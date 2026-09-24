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
import { Api } from '../../../api/api';
import { listDepartments, listEmployees } from '../../../api/functions';
import { EmployeeStatus } from '../../../api/models';
import { SessionService } from '../../../core/session/session.service';
import { ListQueryState, PAGE_SIZES } from '../../../shared/table/list-query';
import { ErrorAlert } from '../../../shared/ui/error-alert';
import { StatusBadge } from '../../../shared/ui/status-badge';
import { EMPLOYEE_STATUS_TONES } from './employee-status';

/** Employee list (H01): server-side search, filters, sort and paging kept in the URL. */
@Component({
  selector: 'app-employee-list-page',
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
  ],
  templateUrl: './employee-list.page.html',
  styleUrl: './employee-list.page.scss',
})
export class EmployeeListPage implements OnInit {
  private readonly api = inject(Api);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly session = inject(SessionService);
  protected readonly list = new ListQueryState(['status', 'departmentId']);

  protected readonly columns = [
    'employeeNumber',
    'fullName',
    'department',
    'manager',
    'status',
    'account',
  ];
  protected readonly pageSizes = PAGE_SIZES;
  protected readonly statuses: EmployeeStatus[] = ['ACTIVE', 'INACTIVE'];
  protected readonly statusTones = EMPLOYEE_STATUS_TONES;
  protected readonly search = new FormControl(this.list.query().q ?? '', { nonNullable: true });

  protected readonly employees = resource({
    params: () => this.list.query(),
    loader: ({ params }) =>
      this.api.invoke(listEmployees, {
        page: params.page,
        size: params.size,
        sort: params.sort,
        q: params.q,
        status: params.filters['status'] as EmployeeStatus | undefined,
        departmentId: params.filters['departmentId'],
      }),
  });

  protected readonly departments = resource({
    loader: () => this.api.invoke(listDepartments),
    defaultValue: [],
  });

  protected readonly sortState = computed(() => {
    const [active = '', direction = ''] = (this.list.query().sort ?? '').split(',');
    return { active, direction: direction as 'asc' | 'desc' | '' };
  });

  protected readonly isFiltered = computed(() => {
    const query = this.list.query();
    return !!query.q || Object.keys(query.filters).length > 0;
  });

  protected readonly canCreate = computed(() => this.session.permissions().has('employees.write'));

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

  protected clearFilters(): void {
    this.search.setValue('', { emitEvent: false });
    this.list.setSearch('');
    this.list.setFilter('status', null);
    this.list.setFilter('departmentId', null);
  }
}
