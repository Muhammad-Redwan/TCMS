import { inject, Pipe, PipeTransform } from '@angular/core';
import { LocaleService } from '../../core/i18n/locale.service';

/**
 * Money rules (guide §4 "Time/money"): amounts travel as decimal strings with a currency, are
 * never converted to floating point, and totals always come from the server.
 */

/** Minor-unit digits of a currency, e.g. KWD 3, SAR 2, JPY 0. */
export function currencyDigits(currency: string): number {
  try {
    return (
      new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

const ARABIC_INDIC = /[٠-٩۰-۹]/g;

/**
 * Turns what a person typed into a plain decimal string: Arabic-Indic and Persian digits become
 * 0-9, the Arabic decimal separator (٫) or a comma becomes ".", spaces and thousands separators
 * (٬) are dropped. Returns the trimmed input unchanged when it still is not a number.
 */
export function normalizeAmount(input: string): string {
  let text = input.trim().replace(/[\s٬']/g, '');
  text = text.replace(ARABIC_INDIC, (d) => {
    const code = d.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
  text = text.replace(/[٫,]/g, '.');
  return text;
}

/** True for a positive amount with no more decimals than the currency allows. */
export function isValidAmount(text: string, currency: string): boolean {
  const digits = currencyDigits(currency);
  const pattern = digits === 0 ? /^\d+$/ : new RegExp(`^\\d+(\\.\\d{1,${digits}})?$`);
  return pattern.test(text) && /[1-9]/.test(text);
}

/**
 * Formats a decimal string exactly. Intl.NumberFormat accepts numeric strings without
 * converting through a JavaScript number, so "0.1" stays "0.100" in KWD.
 */
export function formatMoney(amount: string, currency: string, locale: string): string {
  const tag = locale === 'ar' ? 'ar-u-nu-latn' : 'en-GB';
  try {
    return new Intl.NumberFormat(tag, { style: 'currency', currency }).format(
      amount as unknown as number,
    );
  } catch {
    return `${amount} ${currency}`;
  }
}

@Pipe({ name: 'money', pure: false })
export class MoneyPipe implements PipeTransform {
  private readonly locale = inject(LocaleService);

  transform(amount: string | null | undefined, currency: string | null | undefined): string {
    if (amount == null || !currency) return '';
    return formatMoney(amount, currency, this.locale.locale());
  }
}
