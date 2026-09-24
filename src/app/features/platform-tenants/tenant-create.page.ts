import { Component, ElementRef, inject, Injector, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatOption } from '@angular/material/core';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSelect } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Api } from '../../api/api';
import { createTenant } from '../../api/functions';
import { ApiError, isApiError } from '../../core/errors/api-error';
import { newIdempotencyKey } from '../../core/http/versioned';
import { FieldErrorText } from '../../shared/forms/field-error';
import { applyServerErrors, focusFirstInvalid } from '../../shared/forms/server-errors';
import { HasUnsavedChanges } from '../../shared/forms/unsaved-changes.guard';
import { ErrorAlert } from '../../shared/ui/error-alert';
import { Notifier } from '../../shared/ui/notifier';

const TIMEZONES = [
  'Asia/Kuwait',
  'Asia/Riyadh',
  'Asia/Dubai',
  'Asia/Qatar',
  'Asia/Bahrain',
  'Asia/Muscat',
  'Africa/Cairo',
  'Asia/Amman',
  'UTC',
];
const CURRENCIES = ['KWD', 'SAR', 'AED', 'QAR', 'BHD', 'OMR', 'EGP', 'JOD', 'USD', 'EUR'];

/**
 * Provision a tenant (T02 create). The backend answers 202 and provisions asynchronously;
 * the user lands on the detail page, which shows real progress (FE-001).
 */
@Component({
  selector: 'app-tenant-create-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
    MatButton,
    MatFormField,
    MatLabel,
    MatHint,
    MatError,
    MatInput,
    MatSelect,
    MatOption,
    FieldErrorText,
    ErrorAlert,
  ],
  template: `
    <nav class="breadcrumb">
      <a routerLink="/platform/tenants">{{ 'tenants.title' | transloco }}</a>
    </nav>
    <h1>{{ 'tenants.newTitle' | transloco }}</h1>

    @if (saveError(); as error) {
      @if (error.fieldErrors.length === 0) {
        <app-error-alert [error]="error" />
      }
    }

    <form [formGroup]="form" (ngSubmit)="save()" novalidate class="form-grid">
      <mat-form-field>
        <mat-label>{{ 'tenants.fields.displayName' | transloco }}</mat-label>
        <input
          matInput
          formControlName="displayName"
          required
          dir="auto"
          data-testid="tenant-display-name"
        />
        <mat-error
          ><app-field-error
            [control]="form.controls.displayName"
            [errors]="form.controls.displayName.errors"
        /></mat-error>
      </mat-form-field>

      <mat-form-field>
        <mat-label>{{ 'tenants.fields.legalName' | transloco }}</mat-label>
        <input
          matInput
          formControlName="legalName"
          required
          dir="auto"
          data-testid="tenant-legal-name"
        />
        <mat-error
          ><app-field-error
            [control]="form.controls.legalName"
            [errors]="form.controls.legalName.errors"
        /></mat-error>
      </mat-form-field>

      <mat-form-field>
        <mat-label>{{ 'tenants.fields.adminEmail' | transloco }}</mat-label>
        <input
          matInput
          type="email"
          formControlName="adminEmail"
          required
          dir="ltr"
          data-testid="tenant-admin-email"
        />
        <mat-hint>{{ 'tenants.hints.adminEmail' | transloco }}</mat-hint>
        <mat-error
          ><app-field-error
            [control]="form.controls.adminEmail"
            [errors]="form.controls.adminEmail.errors"
        /></mat-error>
      </mat-form-field>

      <mat-form-field>
        <mat-label>{{ 'tenants.fields.timezone' | transloco }}</mat-label>
        <mat-select formControlName="timezone" required>
          @for (zone of timezones; track zone) {
            <mat-option [value]="zone">{{ zone }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field>
        <mat-label>{{ 'tenants.fields.currency' | transloco }}</mat-label>
        <mat-select formControlName="currency" required>
          @for (currency of currencies; track currency) {
            <mat-option [value]="currency">{{ currency }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field>
        <mat-label>{{ 'tenants.fields.defaultLocale' | transloco }}</mat-label>
        <mat-select formControlName="defaultLocale" required>
          <mat-option value="en">{{ 'locales.en' | transloco }}</mat-option>
          <mat-option value="ar">{{ 'locales.ar' | transloco }}</mat-option>
        </mat-select>
      </mat-form-field>

      <div class="actions">
        <button matButton="filled" type="submit" [disabled]="saving()" data-testid="submit-tenant">
          {{ 'tenants.create' | transloco }}
        </button>
        <a matButton routerLink="/platform/tenants">{{ 'common.cancel' | transloco }}</a>
      </div>
    </form>
  `,
})
export class TenantCreatePage implements HasUnsavedChanges {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly timezones = TIMEZONES;
  protected readonly currencies = CURRENCIES;
  protected readonly form = inject(FormBuilder).nonNullable.group({
    displayName: ['', Validators.required],
    legalName: ['', Validators.required],
    adminEmail: ['', [Validators.required, Validators.email]],
    timezone: ['Asia/Kuwait', Validators.required],
    currency: ['KWD', Validators.required],
    defaultLocale: ['en' as 'en' | 'ar', Validators.required],
  });
  protected readonly saving = signal(false);
  protected readonly saveError = signal<ApiError | null>(null);
  private readonly idempotencyKey = newIdempotencyKey();

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
    this.saving.set(true);
    try {
      const v = this.form.getRawValue();
      const tenant = await this.api.invoke(createTenant, {
        'Idempotency-Key': this.idempotencyKey,
        body: {
          ...v,
          displayName: v.displayName.trim(),
          legalName: v.legalName.trim(),
          adminEmail: v.adminEmail.trim(),
        },
      });
      this.form.markAsPristine();
      this.notifier.success('tenants.started');
      await this.router.navigate(['/platform/tenants', tenant.id], { replaceUrl: true });
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
}
