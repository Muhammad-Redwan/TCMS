import { Directive, inject, input } from '@angular/core';
import { AbstractControl, NgControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { currencyDigits, isValidAmount, normalizeAmount } from '../format/money';

/**
 * Amount must be positive and fit the currency's minor units. `currency` is read on every
 * validation so a form can switch currency without rebuilding validators.
 */
export function amountValidator(currency: () => string): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = String(control.value ?? '');
    if (!value) return null;
    const text = normalizeAmount(value);
    return isValidAmount(text, currency())
      ? null
      : { amount: { digits: currencyDigits(currency()) } };
  };
}

/**
 * For amount text inputs: numeric keyboard on phones, left-to-right digits in Arabic pages,
 * and on blur the typed value becomes a plain decimal string (Arabic digits, ٫ and , handled).
 */
@Directive({
  selector: 'input[appAmountInput]',
  host: {
    inputmode: 'decimal',
    dir: 'ltr',
    autocomplete: 'off',
    '(blur)': 'normalize()',
  },
})
export class AmountInput {
  private readonly control = inject(NgControl, { self: true });
  /** Optional: pad to the currency's decimals on blur, e.g. "3.5" -> "3.500" for KWD. */
  readonly appAmountInput = input<string>('');

  protected normalize(): void {
    const current = this.control.value;
    if (typeof current !== 'string' || !current) return;
    let text = normalizeAmount(current);
    const currency = this.appAmountInput();
    if (currency && isValidAmount(text, currency)) {
      const digits = currencyDigits(currency);
      const [whole, fraction = ''] = text.split('.');
      text = digits ? `${whole}.${fraction.padEnd(digits, '0')}` : whole;
    }
    if (text !== current) this.control.control?.setValue(text);
  }
}
