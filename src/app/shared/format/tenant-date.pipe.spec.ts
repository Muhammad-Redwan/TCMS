import { formatTenantDate } from './tenant-date.pipe';

describe('tenant dates (FE-017)', () => {
  it('shows a UTC timestamp in the tenant time zone', () => {
    // 22:30 UTC on 1 Sept is already 2 Sept 01:30 in Kuwait (UTC+3).
    expect(formatTenantDate('2026-09-01T22:30:00Z', 'en', 'Asia/Kuwait')).toBe(
      '2 Sept 2026, 01:30',
    );
  });

  it('never shifts a date-only trip day, whatever the tenant time zone', () => {
    expect(formatTenantDate('2026-09-01', 'en', 'Pacific/Kiritimati')).toBe('1 Sept 2026');
    expect(formatTenantDate('2026-09-01', 'en', 'America/Los_Angeles', 'dateTime')).toBe(
      '1 Sept 2026',
    );
  });

  it('formats in Arabic with Western digits', () => {
    // Exact Arabic wording varies by ICU version; the rule is Western digits and the right day.
    const text = formatTenantDate('2026-09-01', 'ar', 'Asia/Kuwait', 'date');
    expect(text).toContain('2026');
    expect(text).toMatch(/0?1/);
    expect(text).not.toMatch(/[٠-٩]/);
  });

  it('returns unparseable input unchanged instead of "Invalid Date"', () => {
    expect(formatTenantDate('not-a-date', 'en', 'UTC')).toBe('not-a-date');
  });
});
