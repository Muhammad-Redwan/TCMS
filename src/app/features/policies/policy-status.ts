import { PolicyStatus, TransportMode } from '../../api/models';
import { BadgeTone } from '../../shared/ui/status-badge';

export const POLICY_STATUS_TONES: Record<PolicyStatus, BadgeTone> = {
  DRAFT: 'warning',
  PUBLISHED: 'success',
  RETIRED: 'neutral',
};

export const TRANSPORT_MODES: TransportMode[] = [
  'TAXI',
  'RIDE_HAILING',
  'BUS',
  'METRO',
  'PERSONAL_CAR',
  'OTHER',
];

/** Currencies offered in pickers; the backend decides which are supported. */
export const CURRENCIES = ['KWD', 'SAR', 'AED', 'QAR', 'BHD', 'OMR', 'EGP', 'JOD', 'USD', 'EUR'];
