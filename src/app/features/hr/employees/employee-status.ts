import { EmployeeStatus } from '../../../api/models';
import { BadgeTone } from '../../../shared/ui/status-badge';

export const EMPLOYEE_STATUS_TONES: Record<EmployeeStatus, BadgeTone> = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
};
