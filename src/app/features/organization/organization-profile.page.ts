import {
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  OnInit,
  resource,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocomplete, MatAutocompleteTrigger } from '@angular/material/autocomplete';
import { MatButton } from '@angular/material/button';
import { MatOption } from '@angular/material/core';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatSelect } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import { Api } from '../../api/api';
import { getOrganization, updateOrganization } from '../../api/functions';
import { Organization, OrganizationUpdate } from '../../api/models';
import { ApiError, isApiError } from '../../core/errors/api-error';
import { versioned, Versioned } from '../../core/http/versioned';
import { SessionService } from '../../core/session/session.service';
import { FieldErrorText } from '../../shared/forms/field-error';
import { applyServerErrors, focusFirstInvalid } from '../../shared/forms/server-errors';
import { HasUnsavedChanges } from '../../shared/forms/unsaved-changes.guard';
import { ErrorAlert } from '../../shared/ui/error-alert';
import { Notifier } from '../../shared/ui/notifier';

/** Currencies offered in the picker; the backend decides which are actually supported. */
const CURRENCIES = ['KWD', 'SAR', 'AED', 'QAR', 'BHD', 'OMR', 'EGP', 'JOD', 'USD', 'EUR'];

/** Company profile (O01). Read-only without org.settings.write. */
@Component({
  selector: 'app-organization-profile-page',
  imports: [
    ReactiveFormsModule,
    TranslocoPipe,
    MatButton,
    MatFormField,
    MatLabel,
    MatHint,
    MatError,
    MatInput,
    MatSelect,
    MatOption,
    MatAutocomplete,
    MatAutocompleteTrigger,
    MatProgressBar,
    FieldErrorText,
    ErrorAlert,
  ],
  templateUrl: './organization-profile.page.html',
})
export class OrganizationProfilePage implements OnInit, HasUnsavedChanges {
  private readonly api = inject(Api);
  private readonly notifier = inject(Notifier);
  private readonly session = inject(SessionService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly canEdit = computed(() => this.session.permissions().has('org.settings.write'));
  protected readonly currencies = CURRENCIES;
  protected readonly locales = ['en', 'ar'] as const;

  protected readonly form = inject(FormBuilder).nonNullable.group({
    legalName: ['', Validators.required],
    displayName: ['', Validators.required],
    timezone: ['', Validators.required],
    currency: ['', Validators.required],
    defaultLocale: ['en' as 'en' | 'ar', Validators.required],
  });

  private readonly allTimezones = Intl.supportedValuesOf('timeZone');
  private readonly timezoneText = toSignal(this.form.controls.timezone.valueChanges, {
    initialValue: '',
  });
  protected readonly timezoneOptions = computed(() => {
    const text = this.timezoneText().toLocaleLowerCase();
    return this.allTimezones.filter((tz) => tz.toLocaleLowerCase().includes(text)).slice(0, 30);
  });

  protected readonly loaded = resource({
    loader: async () => {
      const result = versioned(await this.api.invoke$Response(getOrganization));
      this.fill(result);
      return result;
    },
  });

  protected readonly saving = signal(false);
  protected readonly saveError = signal<ApiError | null>(null);
  protected readonly conflict = computed(() => [409, 412].includes(this.saveError()?.status ?? 0));
  private etag = '';

  ngOnInit(): void {
    if (!this.canEdit()) this.form.disable();
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
    this.saving.set(true);
    try {
      const v = this.form.getRawValue();
      const body: OrganizationUpdate = {
        legalName: v.legalName.trim(),
        displayName: v.displayName.trim(),
        timezone: v.timezone,
        currency: v.currency,
        defaultLocale: v.defaultLocale,
      };
      const response = await this.api.invoke$Response(updateOrganization, {
        'If-Match': this.etag,
        body,
      });
      this.fill(versioned(response));
      this.notifier.success('organization.saved');
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
    this.loaded.reload();
  }

  private fill({ data, etag }: Versioned<Organization>): void {
    this.etag = etag;
    this.form.reset({
      legalName: data.legalName,
      displayName: data.displayName,
      timezone: data.timezone,
      currency: data.currency,
      defaultLocale: data.defaultLocale,
    });
  }
}
