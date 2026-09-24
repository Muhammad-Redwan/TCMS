import { Component, computed, inject, input, resource, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatProgressBar } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Api } from '../../api/api';
import { getUser, listRoles, setUserRoles } from '../../api/functions';
import { User } from '../../api/models';
import { ApiError, isApiError } from '../../core/errors/api-error';
import { versioned, Versioned } from '../../core/http/versioned';
import { SessionService } from '../../core/session/session.service';
import { HasUnsavedChanges } from '../../shared/forms/unsaved-changes.guard';
import { ErrorAlert } from '../../shared/ui/error-alert';
import { Notifier } from '../../shared/ui/notifier';
import { StatusBadge } from '../../shared/ui/status-badge';
import { USER_STATUS_TONES } from './user-status';

/** User detail and role assignment (I01). Only roles.manage may change roles. */
@Component({
  selector: 'app-user-detail-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    MatButton,
    MatCheckbox,
    MatProgressBar,
    ErrorAlert,
    StatusBadge,
  ],
  template: `
    <nav class="breadcrumb">
      <a routerLink="/identity/users">{{ 'users.title' | transloco }}</a>
    </nav>

    @if (user.error(); as error) {
      <app-error-alert [error]="error" [retryable]="true" (retry)="user.reload()" />
    } @else if (user.value(); as u) {
      <header class="page-header">
        <h1>
          <bdi>{{ u.data.displayName }}</bdi>
        </h1>
        <app-status-badge namespace="status.user" [value]="u.data.status" [tones]="tones" />
      </header>
      <p class="muted">
        <bdi>{{ u.data.email }}</bdi>
      </p>
      <p>
        @if (u.data.employeeId) {
          <a [routerLink]="['/hr/employees', u.data.employeeId]">{{
            'users.linkedEmployee' | transloco
          }}</a>
        } @else {
          {{ 'users.noEmployee' | transloco }}
        }
      </p>

      <section class="roles">
        <h2 id="roles-heading">{{ 'users.fields.roles' | transloco }}</h2>
        <p class="muted">{{ 'users.rolesHint' | transloco }}</p>

        @if (conflict()) {
          <div class="conflict" role="alert" data-testid="conflict">
            <p>{{ 'errors.CONFLICT' | transloco }}</p>
            <button matButton="outlined" type="button" (click)="reloadLatest()">
              {{ 'common.reloadLatest' | transloco }}
            </button>
          </div>
        } @else if (saveError(); as error) {
          @if (error.fieldErrors.length > 0) {
            <div class="field-error" role="alert" data-testid="roles-error">
              @for (fieldError of error.fieldErrors; track fieldError.code) {
                <p>{{ 'validation.server.' + fieldError.code | transloco }}</p>
              }
            </div>
          } @else {
            <app-error-alert [error]="error" />
          }
        }

        <ul role="group" aria-labelledby="roles-heading">
          @for (role of roles.value(); track role.key) {
            <li>
              <mat-checkbox
                [checked]="selected().has(role.key)"
                [disabled]="!canManage() || saving()"
                (change)="toggle(role.key, $event.checked)"
                [attr.data-testid]="'role-' + role.key"
              >
                <span class="role-name">{{ 'roles.' + role.key | transloco }}</span>
                <span class="role-description">{{
                  'roles.descriptions.' + role.key | transloco
                }}</span>
              </mat-checkbox>
            </li>
          }
        </ul>

        @if (canManage()) {
          <div class="actions">
            <button
              matButton="filled"
              type="button"
              [disabled]="!dirty() || saving()"
              (click)="save()"
              data-testid="save-roles"
            >
              {{ 'common.save' | transloco }}
            </button>
          </div>
        }
      </section>
    } @else {
      <mat-progress-bar mode="indeterminate" [attr.aria-label]="'common.loading' | transloco" />
    }
  `,
  styles: `
    .muted {
      color: var(--mat-sys-on-surface-variant);
    }
    .roles {
      max-width: 40rem;
      h2 {
        font-size: 1.125rem;
        margin-block: 1.5rem 0.25rem;
      }
      ul {
        list-style: none;
        padding: 0;
        margin: 0.5rem 0;
      }
    }
    .role-name {
      font-weight: 500;
    }
    .role-description {
      display: block;
      font-size: 0.875rem;
      color: var(--mat-sys-on-surface-variant);
    }
    .field-error {
      padding: 0.75rem 1rem;
      margin-block-end: 0.5rem;
      border-inline-start: 4px solid var(--mat-sys-error);
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
      p {
        margin: 0;
      }
    }
  `,
})
export class UserDetailPage implements HasUnsavedChanges {
  private readonly api = inject(Api);
  private readonly notifier = inject(Notifier);
  private readonly session = inject(SessionService);

  readonly userId = input.required<string>();

  protected readonly tones = USER_STATUS_TONES;
  protected readonly canManage = computed(() => this.session.permissions().has('roles.manage'));
  protected readonly user = resource({
    params: () => this.userId(),
    loader: async ({ params: userId }): Promise<Versioned<User>> => {
      const result = versioned(await this.api.invoke$Response(getUser, { userId }));
      this.selected.set(new Set(result.data.roles));
      return result;
    },
  });
  protected readonly roles = resource({
    loader: () => this.api.invoke(listRoles),
    defaultValue: [],
  });

  protected readonly selected = signal(new Set<string>());
  protected readonly dirty = computed(() => {
    const saved = this.user.value()?.data.roles ?? [];
    const current = this.selected();
    return saved.length !== current.size || saved.some((r) => !current.has(r));
  });
  protected readonly saving = signal(false);
  protected readonly saveError = signal<ApiError | null>(null);
  protected readonly conflict = computed(() => [409, 412].includes(this.saveError()?.status ?? 0));

  hasUnsavedChanges(): boolean {
    return this.dirty() && !this.saving();
  }

  protected toggle(role: string, checked: boolean): void {
    this.saveError.set(null);
    this.selected.update((set) => {
      const next = new Set(set);
      if (checked) next.add(role);
      else next.delete(role);
      return next;
    });
  }

  protected async save(): Promise<void> {
    const current = this.user.value();
    if (!current || this.saving()) return;
    this.saving.set(true);
    this.saveError.set(null);
    try {
      // Keep the catalogue order so the request is stable regardless of click order.
      const roles = this.roles
        .value()
        .map((r) => r.key)
        .filter((key) => this.selected().has(key));
      const response = await this.api.invoke$Response(setUserRoles, {
        userId: this.userId(),
        'If-Match': current.etag,
        body: { roles },
      });
      const updated = versioned(response);
      this.user.set(updated);
      this.selected.set(new Set(updated.data.roles));
      this.notifier.success('users.saved');
    } catch (error) {
      if (!isApiError(error)) throw error;
      this.saveError.set(error);
    } finally {
      this.saving.set(false);
    }
  }

  protected reloadLatest(): void {
    this.saveError.set(null);
    this.user.reload();
  }
}
