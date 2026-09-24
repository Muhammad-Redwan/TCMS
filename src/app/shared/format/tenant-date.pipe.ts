import { inject, Pipe, PipeTransform } from '@angular/core';
import { LocaleService } from '../../core/i18n/locale.service';
import { SessionService } from '../../core/session/session.service';

export type DateStyle = 'date' | 'dateTime';

/**
 * Formats an API timestamp in the tenant's time zone and the viewer's language (guide §4
 * "Time/money", FE-017). Date-only values (YYYY-MM-DD) are shown as calendar days and never
 * shifted by time zone.
 */
export function formatTenantDate(
  value: string,
  locale: string,
  timeZone: string,
  style: DateStyle = 'dateTime',
): string {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-u-nu-latn' : 'en-GB', {
    timeZone: dateOnly ? 'UTC' : timeZone,
    dateStyle: 'medium',
    ...(style === 'dateTime' && !dateOnly ? { timeStyle: 'short' } : {}),
  }).format(date);
}

/** Today as YYYY-MM-DD in the given time zone (the tenant's calendar day, not the browser's). */
export function todayInTimeZone(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

@Pipe({ name: 'tenantDate', pure: false })
export class TenantDatePipe implements PipeTransform {
  private readonly session = inject(SessionService);
  private readonly locale = inject(LocaleService);

  transform(value: string | null | undefined, style: DateStyle = 'dateTime'): string {
    if (!value) return '';
    const timeZone = this.session.me()?.tenant.timezone ?? 'UTC';
    return formatTenantDate(value, this.locale.locale(), timeZone, style);
  }
}
