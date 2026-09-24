import { Claim, Policy, Receipt } from '../app/api/models';

/** Server-side receipt fields that never leave the mock "backend". */
export interface ReceiptMeta {
  expectedContentType: string;
  expectedSize: number;
  uploaded: boolean;
  scanStartedAt?: number;
  /** Content fingerprint used to spot the same file on another claim. */
  hash?: string;
  sniffedType?: string | null;
}

export type MockReceipt = Receipt & { meta: ReceiptMeta };

/** Claims are stored with their owner; totals, findings and actions are computed on read. */
export type MockClaim = Omit<Claim, 'receipts' | 'findings' | 'allowedActions' | 'totalAmount'> & {
  ownerId: string;
  receipts: MockReceipt[];
};

export type MockPolicy = Policy;

export function seedPolicies(): MockPolicy[] {
  return [
    {
      id: 'pol_1',
      name: 'Transportation allowance',
      status: 'PUBLISHED',
      version: 1,
      rev: 1,
      effectiveFrom: '2026-01-01',
      currency: 'KWD',
      monthlyLimit: '60.000',
      perTripLimit: '10.000',
      receiptRequiredAbove: '3.000',
      allowedModes: ['TAXI', 'RIDE_HAILING', 'BUS', 'METRO'],
      eligibleDepartmentIds: [],
      submissionDeadlineDays: 10,
      publishedAt: '2025-12-20T08:00:00Z',
    },
  ];
}

const item = (
  id: string,
  tripDate: string,
  amount: string,
  from: string,
  to: string,
  mode: Claim['items'][number]['mode'] = 'TAXI',
) => ({
  id,
  tripDate,
  mode,
  fromLocation: from,
  toLocation: to,
  purpose: 'Client visit',
  amount,
  receiptId: null,
});

/** Fabricated claims for the Employee Demo persona (usr_employee). */
export function seedClaims(): MockClaim[] {
  return [
    {
      id: 'clm_101',
      number: 'CLM-2026-0101',
      ownerId: 'usr_employee',
      status: 'SETTLED',
      period: '2026-07',
      currency: 'KWD',
      policyId: 'pol_1',
      policyVersion: 1,
      items: [
        item('itm_1011', '2026-07-06', '2.750', 'Head office', 'Shuwaikh port', 'RIDE_HAILING'),
        item('itm_1012', '2026-07-14', '1.500', 'Head office', 'Free trade zone', 'BUS'),
        item('itm_1013', '2026-07-22', '2.250', 'Shuwaikh port', 'Head office'),
      ],
      receipts: [],
      timeline: [
        { at: '2026-08-02T07:10:00Z', type: 'SUBMITTED', actorName: 'Employee Demo', note: null },
        { at: '2026-08-04T09:30:00Z', type: 'APPROVED', actorName: 'Approver Demo', note: null },
        { at: '2026-08-15T11:00:00Z', type: 'SETTLED', actorName: 'Finance Demo', note: null },
      ],
      submittedAt: '2026-08-02T07:10:00Z',
      updatedAt: '2026-08-15T11:00:00Z',
      version: 4,
    },
    {
      id: 'clm_117',
      number: 'CLM-2026-0117',
      ownerId: 'usr_employee',
      status: 'NEEDS_CHANGES',
      period: '2026-08',
      currency: 'KWD',
      policyId: 'pol_1',
      policyVersion: 1,
      items: [
        item('itm_1171', '2026-08-12', '4.500', 'Head office', 'Ahmadi warehouse'),
        item('itm_1172', '2026-08-19', '1.250', 'Head office', 'City centre', 'METRO'),
      ],
      receipts: [],
      timeline: [
        { at: '2026-09-01T06:40:00Z', type: 'SUBMITTED', actorName: 'Employee Demo', note: null },
        {
          at: '2026-09-02T10:15:00Z',
          type: 'CHANGES_REQUESTED',
          actorName: 'Approver Demo',
          note: 'Please attach the receipt for the 12 August taxi.',
        },
      ],
      submittedAt: '2026-09-01T06:40:00Z',
      updatedAt: '2026-09-02T10:15:00Z',
      version: 3,
    },
    {
      id: 'clm_120',
      number: 'CLM-2026-0120',
      ownerId: 'usr_employee',
      status: 'DRAFT',
      period: '2026-09',
      currency: 'KWD',
      policyId: 'pol_1',
      policyVersion: 1,
      items: [
        item('itm_1201', '2026-09-03', '2.000', 'Head office', 'Airport cargo', 'RIDE_HAILING'),
      ],
      receipts: [],
      timeline: [
        { at: '2026-09-03T15:00:00Z', type: 'CREATED', actorName: 'Employee Demo', note: null },
      ],
      submittedAt: null,
      updatedAt: '2026-09-03T15:00:00Z',
      version: 1,
    },
  ];
}
