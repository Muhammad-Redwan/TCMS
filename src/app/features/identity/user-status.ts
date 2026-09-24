import { UserStatus } from '../../api/models';
import { BadgeTone } from '../../shared/ui/status-badge';

export const USER_STATUS_TONES: Record<UserStatus, BadgeTone> = {
  ACTIVE: 'success',
  INVITED: 'info',
  DISABLED: 'neutral',
};
