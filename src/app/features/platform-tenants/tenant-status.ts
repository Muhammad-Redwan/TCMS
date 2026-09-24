import { TenantStatus } from '../../api/models';
import { BadgeTone } from '../../shared/ui/status-badge';

export const TENANT_STATUS_TONES: Record<TenantStatus, BadgeTone> = {
  PROVISIONING: 'info',
  READY: 'success',
  FAILED: 'danger',
};
