import { computed, inject, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Params, Router } from '@angular/router';

export interface ListQuery {
  page: number;
  size: number;
  sort?: string;
  q?: string;
  /** Screen-specific filters such as status or departmentId. */
  filters: Record<string, string>;
}

export const PAGE_SIZES = [10, 20, 50];
const DEFAULT_SIZE = 20;

/**
 * List state (page, size, sort, search, filters) lives in the URL query string, so reload,
 * back/forward and shared links restore the same view (guide §3). The server does all sorting
 * and filtering; changing a filter resets to the first page (guide §4 "Pagination").
 */
export class ListQueryState {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.queryParams, {
    initialValue: this.route.snapshot.queryParams,
  });

  readonly query: Signal<ListQuery>;

  constructor(private readonly filterKeys: readonly string[] = []) {
    this.query = computed(() => parse(this.params(), this.filterKeys));
  }

  setPage(page: number, size: number): void {
    this.patch({ page: page === 0 ? null : page, size: size === DEFAULT_SIZE ? null : size });
  }

  setSort(active: string, direction: 'asc' | 'desc' | ''): void {
    this.patch({ sort: direction ? `${active},${direction}` : null, page: null });
  }

  setSearch(q: string): void {
    this.patch({ q: q.trim() || null, page: null });
  }

  setFilter(key: string, value: string | null): void {
    this.patch({ [key]: value || null, page: null });
  }

  private patch(changes: Params): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: changes,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}

export function parse(params: Params, filterKeys: readonly string[]): ListQuery {
  const page = Number(params['page']);
  const size = Number(params['size']);
  const filters: Record<string, string> = {};
  for (const key of filterKeys) {
    if (typeof params[key] === 'string' && params[key]) filters[key] = params[key];
  }
  return {
    page: Number.isInteger(page) && page > 0 ? page : 0,
    size: PAGE_SIZES.includes(size) ? size : DEFAULT_SIZE,
    sort: typeof params['sort'] === 'string' ? params['sort'] : undefined,
    q: typeof params['q'] === 'string' && params['q'] ? params['q'] : undefined,
    filters,
  };
}
