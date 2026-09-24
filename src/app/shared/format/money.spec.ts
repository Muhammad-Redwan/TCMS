import { currencyDigits, formatMoney, isValidAmount, normalizeAmount } from './money';

describe('money', () => {
  it('knows minor units per currency', () => {
    expect(currencyDigits('KWD')).toBe(3);
    expect(currencyDigits('SAR')).toBe(2);
    expect(currencyDigits('JPY')).toBe(0);
  });

  it('normalizes Arabic-Indic and Persian digits and separators', () => {
    expect(normalizeAmount(' ١٢٫٥٠٠ ')).toBe('12.500');
    expect(normalizeAmount('۳۴,۵')).toBe('34.5');
    expect(normalizeAmount('1٬250.75')).toBe('1250.75');
  });

  it('accepts positive amounts within the currency precision only', () => {
    expect(isValidAmount('12.500', 'KWD')).toBe(true);
    expect(isValidAmount('12.5000', 'KWD')).toBe(false);
    expect(isValidAmount('12.505', 'SAR')).toBe(false);
    expect(isValidAmount('0.000', 'KWD')).toBe(false);
    expect(isValidAmount('-3', 'KWD')).toBe(false);
    expect(isValidAmount('abc', 'KWD')).toBe(false);
  });

  it('formats decimal strings exactly, without floating point drift', () => {
    // Intl separates the currency code with a non-breaking space.
    expect(formatMoney('0.1', 'KWD', 'en').replace(/\s/g, ' ')).toBe('KWD 0.100');
    expect(formatMoney('12345678901234.567', 'KWD', 'en')).toContain('12,345,678,901,234.567');
  });

  it('uses Western digits in Arabic', () => {
    const text = formatMoney('12.5', 'KWD', 'ar');
    expect(text).toContain('12.500');
    expect(text).not.toMatch(/[٠-٩]/);
  });
});
