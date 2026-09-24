import { BatchStatus } from '../../api/models';
import { BadgeTone } from '../../shared/ui/status-badge';

export const BATCH_STATUS_TONES: Record<BatchStatus, BadgeTone> = {
  DRAFT: 'neutral',
  EXPORT_PENDING: 'info',
  EXPORT_CREATED: 'warning',
  EXPORT_FAILED: 'danger',
  PAYMENT_RECORDED: 'success',
};
