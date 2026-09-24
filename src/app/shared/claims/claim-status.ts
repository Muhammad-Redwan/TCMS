import { ClaimStatus, ScanStatus } from '../../api/models';
import { BadgeTone } from '../ui/status-badge';

export const CLAIM_STATUSES: ClaimStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'NEEDS_CHANGES',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'READY_FOR_SETTLEMENT',
  'SETTLED',
];

export const CLAIM_STATUS_TONES: Record<ClaimStatus, BadgeTone> = {
  DRAFT: 'neutral',
  SUBMITTED: 'info',
  NEEDS_CHANGES: 'warning',
  UNDER_REVIEW: 'info',
  APPROVED: 'success',
  REJECTED: 'danger',
  READY_FOR_SETTLEMENT: 'success',
  SETTLED: 'success',
};

export const SCAN_STATUS_TONES: Record<ScanStatus, BadgeTone> = {
  AWAITING_UPLOAD: 'neutral',
  SCANNING: 'info',
  CLEAN: 'success',
  REJECTED: 'danger',
};

/** "2026-09" as a localized month name, without time-zone math (it is a calendar month). */
export function formatPeriod(period: string, locale: string): string {
  const [year, month] = period.split('-').map(Number);
  if (!year || !month) return period;
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-u-nu-latn' : 'en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}
