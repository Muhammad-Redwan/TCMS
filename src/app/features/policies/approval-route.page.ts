import { Component, computed, ElementRef, inject, Injector, resource, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatOption } from '@angular/material/core';
import { MatError, MatFormField, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatSelect } from '@angular/material/select';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Api } from '../../api/api';
import { getApprovalRoute, updateApprovalRoute } from '../../api/functions';
import { ApprovalRoute, FirstApprover } from '../../api/models';
import { ApiError, isApiError } from '../../core/errors/api-error';
import { versioned, Versioned } from '../../core/http/versioned';
import { SessionService } from '../../core/session/session.service';
import { AmountInput, amountValidator } from '../../shared/forms/amount-input';
import { FieldErrorText } from '../../shared/forms/field-error';
import { userSearch } from '../../shared/forms/picker-searches';
import { SearchPicker } from '../../shared/forms/search-picker';
import { applyServerErrors, focusFirstInvalid } from '../../shared/forms/server-errors';
import { HasUnsavedChanges } from '../../shared/forms/unsaved-changes.guard';
import { ErrorAlert } from '../../shared/ui/error-alert';
import { Notifier } from '../../shared/ui/notifier';

/**
 * Approval routing (P02): who approves first, the fallback when the claimant has no manager
 * (or is the manager), and an optional second approval above an amount. The backend never
 * routes a claim to its own claimant; a change applies to claims submitted afterwards.
 */
@Component({
  selector: 'app-approval-route-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
    MatButton,
    MatFormField,
    MatLabel,
    MatError,
    MatSuffix,
    MatInput,
    MatSelect,
    MatOption,
    MatSlideToggle,
    MatProgressBar,
    AmountInput,
    FieldErrorText,
    SearchPicker,
    ErrorAlert,
  ],
  template: `
    <nav class="breadcrumb">
      <a routerLink="/policies">{{ 'policies.title' | transloco }}</a>
    </nav>
    <h1>{{ 'routing.title' | transloco }}</h1>
    <p class="muted">{{ 'routing.intro' | transloco }}</p>

    @if (route.isLoading() && !route.hasValue()) {
      <mat-progress-bar mode="indeterminate" [attr.aria-label]="'common.loading' | transloco" />
    }
    @if (route.error(); as error) {
      <app-error-alert [error]="error" [retryable]="true" (retry)="route.reload()" />
    } @else if (route.value(); as record) {
      @if (saveError(); as error) {
        @if (conflict()) {
          <div class="conflict" role="alert" data-testid="conflict">
            <p>{{ 'errors.CONFLICT' | transloco }}</p>
            <button matButton="outlined" type="button" (click)="reloadLatest()">
              {{ 'common.reloadLatest' | transloco }}
            </button>
          </div>
        } @else if (error.fieldErrors.length === 0) {
          <app-error-alert [error]="error" />
        }
      }

      <form [formGroup]="form" (ngSubmit)="save()" novalidate class="form-grid">
        <mat-form-field>
          <mat-label>{{ 'routing.firstApprover' | transloco }}</mat-label>
          <mat-select formControlName="firstApprover" required>
            @for (option of firstApprovers; track option) {
              <mat-option [value]="option">{{ 'routing.first.' + option | transloco }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <app-search-picker
          formControlName="fallbackApproverUserId"
          [label]="'routing.fallback' | transloco"
          [hint]="'routing.fallbackHint' | transloco"
          [search]="userSearch"
          [required]="true"
          [initialLabel]="record.data.fallbackApproverName ?? null"
          data-testid="fallback-approver"
        />

        <div class="full-width toggle">
          <mat-slide-toggle formControlName="secondEnabled" data-testid="second-enabled">
            {{ 'routing.secondToggle' | transloco }}
          </mat-slide-toggle>
        </div>

        @if (form.controls.secondEnabled.value) {
          <mat-form-field>
            <mat-label>{{ 'routing.secondAbove' | transloco }}</mat-label>
            <input
              matInput
              formControlName="secondApprovalAbove"
              [appAmountInput]="currency()"
              required
              data-testid="second-above"
            />
            <span matTextSuffix>&nbsp;{{ currency() }}</span>
            <mat-error>
              <app-field-error
                [control]="form.controls.secondApprovalAbove"
                [errors]="form.controls.secondApprovalAbove.errors"
              />
            </mat-error>
          </mat-form-field>
          <app-search-picker
            formControlName="secondApproverUserId"
            [label]="'routing.secondApprover' | transloco"
            [search]="userSearch"
            [required]="true"
            [initialLabel]="record.data.secondApproverName ?? null"
          />
        }

        @if (canEdit()) {
          <div class="actions">
            <button matButton="filled" type="submit" [disabled]="saving()" data-testid="save-route">
              {{ 'common.save' | transloco }}
            </button>
          </div>
        }
      </form>
    }
  `,
  styles: `
    .muted {
      color: var(--mat-sys-on-surface-variant);
      max-width: 48rem;
    }
    .toggle {
      padding-block: 0.5rem;
    }
  `,
})
export class ApprovalRoutePage implements HasUnsavedChanges {
  private readonly api = inject(Api);
  private readonly notifier = inject(Notifier);
  private readonly session = inject(SessionService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly userSearch = userSearch();
  protected readonly firstApprovers: FirstApprover[] = ['LINE_MANAGER', 'DEPARTMENT_MANAGER'];
  protected readonly currency = computed(() => this.session.me()?.tenant.currency ?? 'KWD');
  protected readonly canEdit = computed(() => this.session.permissions().has('policies.write'));

  protected readonly form = this.fb.group({
    firstApprover: ['LINE_MANAGER' as FirstApprover, Validators.required],
    fallbackApproverUserId: this.fb.control<string | null>(null, Validators.required),
    secondEnabled: [false],
    secondApprovalAbove: [''],
    secondApproverUserId: this.fb.control<string | null>(null),
  });

  protected readonly route = resource({
    loader: async () => {
      const result = versioned(await this.api.invoke$Response(getApprovalRoute));
      this.fill(result);
      return result;
    },
  });

  protected readonly saving = signal(false);
  protected readonly saveError = signal<ApiError | null>(null);
  protected readonly conflict = computed(() => [409, 412].includes(this.saveError()?.status ?? 0));
  private etag = '';

  constructor() {
    // Second-approval fields are required only while the toggle is on.
    this.form.controls.secondEnabled.valueChanges.pipe(takeUntilDestroyed()).subscribe((on) => {
      const { secondApprovalAbove, secondApproverUserId } = this.form.controls;
      secondApprovalAbove.setValidators(
        on ? [Validators.required, amountValidator(() => this.currency())] : [],
      );
      secondApproverUserId.setValidators(on ? [Validators.required] : []);
      secondApprovalAbove.updateValueAndValidity();
      secondApproverUserId.updateValueAndValidity();
    });
  }

  hasUnsavedChanges(): boolean {
    return this.form.dirty && !this.saving();
  }

  protected async save(): Promise<void> {
    if (this.saving()) return;
    this.saveError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      focusFirstInvalid(this.host.nativeElement, this.injector);
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    try {
      const response = await this.api.invoke$Response(updateApprovalRoute, {
        'If-Match': this.etag,
        body: {
          firstApprover: v.firstApprover,
          fallbackApproverUserId: v.fallbackApproverUserId!,
          secondApprovalAbove: v.secondEnabled ? v.secondApprovalAbove : null,
          secondApproverUserId: v.secondEnabled ? v.secondApproverUserId : null,
        },
      });
      const updated = versioned(response);
      this.route.set(updated);
      this.fill(updated);
      this.notifier.success('routing.saved');
    } catch (error) {
      if (!isApiError(error)) throw error;
      this.saveError.set(error);
      if (applyServerErrors(this.form, error).length < error.fieldErrors.length) {
        focusFirstInvalid(this.host.nativeElement, this.injector);
      }
    } finally {
      this.saving.set(false);
    }
  }

  protected reloadLatest(): void {
    this.saveError.set(null);
    this.form.markAsPristine();
    this.route.reload();
  }

  private fill({ data, etag }: Versioned<ApprovalRoute>): void {
    this.etag = etag;
    this.form.reset({
      firstApprover: data.firstApprover,
      fallbackApproverUserId: data.fallbackApproverUserId,
      secondEnabled: !!data.secondApprovalAbove,
      secondApprovalAbove: data.secondApprovalAbove ?? '',
      secondApproverUserId: data.secondApproverUserId ?? null,
    });
    if (this.canEdit()) this.form.enable();
    else this.form.disable();
  }
}
