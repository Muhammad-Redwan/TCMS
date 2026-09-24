import { ApprovalRoute, PaymentEvidence, PolicyFinding, SettlementExport } from '../app/api/models';
import { MockClaim } from './claims-seed';

/** Fabricated users referenced by the approval mock (see personas.ts and db users). */
export const APPROVER_ID = 'usr_approver';
export const FALLBACK_APPROVER_ID = 'usr_emp_001';

export type MockRoute = ApprovalRoute;

export function seedRoute(): MockRoute {
  return {
    firstApprover: 'LINE_MANAGER',
    fallbackApproverUserId: FALLBACK_APPROVER_ID,
    fallbackApproverName: 'Omar Sample',
    secondApprovalAbove: null,
    secondApproverUserId: null,
    secondApproverName: null,
    version: 1,
  };
}

export interface MockBatch {
  id: string;
  number: string;
  status: 'DRAFT' | 'EXPORT_PENDING' | 'EXPORT_CREATED' | 'EXPORT_FAILED' | 'PAYMENT_RECORDED';
  claimIds: string[];
  currency: string;
  createdAt: string;
  exports: SettlementExport[];
  exportJobId: string | null;
  exportErrorCode: string | null;
  payment: PaymentEvidence | null;
  version: number;
}

export function seedBatches(): MockBatch[] {
  return [
    {
      id: 'bat_7',
      number: 'SET-2026-0007',
      status: 'PAYMENT_RECORDED',
      claimIds: ['clm_101'],
      currency: 'KWD',
      createdAt: '2026-08-10T08:00:00Z',
      exports: [
        {
          id: 'exp_7',
          format: 'CSV',
          fileName: 'SET-2026-0007.csv',
          createdAt: '2026-08-10T08:05:00Z',
          expiresAt: '2026-08-17T08:05:00Z',
        },
      ],
      exportJobId: null,
      exportErrorCode: null,
      payment: {
        reference: 'NBK-TRX-440192',
        paidOn: '2026-08-15',
        method: 'BANK_TRANSFER',
        note: null,
        recordedBy: 'Finance Demo',
        recordedAt: '2026-08-15T11:00:00Z',
      },
      version: 4,
    },
  ];
}

const trip = (id: string, tripDate: string, amount: string, receiptId: string | null = null) => ({
  id,
  tripDate,
  mode: 'TAXI' as const,
  fromLocation: 'Head office',
  toLocation: 'Customer site',
  purpose: 'Customer meeting',
  amount,
  receiptId,
});

const submittedBy = (at: string, name: string) => ({
  at,
  type: 'SUBMITTED' as const,
  actorName: name,
  note: null,
});

/**
 * Claims from other (fabricated) employees: three waiting for the Approver Demo persona and
 * four already approved and waiting for Finance Demo to settle.
 */
export function seedReviewClaims(): MockClaim[] {
  const perTripWarning: PolicyFinding = {
    code: 'PER_TRIP_LIMIT_EXCEEDED',
    severity: 'WARNING',
    itemIndex: 1,
    params: { limit: '10.000' },
  };
  const waiting = (
    id: string,
    number: string,
    ownerId: string,
    name: string,
    department: string,
    items: ReturnType<typeof trip>[],
    findings: PolicyFinding[],
    submittedAt: string,
  ): MockClaim => ({
    id,
    number,
    ownerId,
    claimantName: name,
    departmentName: department,
    status: 'SUBMITTED',
    period: '2026-09',
    currency: 'KWD',
    policyId: 'pol_1',
    policyVersion: 1,
    items,
    receipts: [],
    timeline: [submittedBy(submittedAt, name)],
    submittedAt,
    updatedAt: submittedAt,
    version: 2,
    approval: { approverIds: [APPROVER_ID], step: 1, decisions: [] },
    submittedFindings: findings,
  });
  const approved = (
    id: string,
    number: string,
    ownerId: string,
    name: string,
    amount: string,
    approvedAt: string,
  ): MockClaim => ({
    id,
    number,
    ownerId,
    claimantName: name,
    departmentName: 'Operations',
    status: 'APPROVED',
    period: '2026-08',
    currency: 'KWD',
    policyId: 'pol_1',
    policyVersion: 1,
    items: [trip(`${id}_1`, '2026-08-11', amount)],
    receipts: [],
    timeline: [
      submittedBy('2026-09-01T07:00:00Z', name),
      { at: approvedAt, type: 'APPROVED', actorName: 'Approver Demo', note: null },
    ],
    submittedAt: '2026-09-01T07:00:00Z',
    updatedAt: approvedAt,
    version: 3,
    approval: {
      approverIds: [APPROVER_ID],
      step: 1,
      decisions: [
        { step: 1, approverId: APPROVER_ID, decision: 'APPROVE', reason: null, at: approvedAt },
      ],
    },
    submittedFindings: [],
    approvedAt,
    batchId: null,
  });

  return [
    waiting(
      'clm_131',
      'CLM-2026-0131',
      'usr_emp_005',
      'Khalid Mock',
      'Operations',
      [trip('itm_1311', '2026-09-08', '2.500'), trip('itm_1312', '2026-09-15', '12.750')],
      [perTripWarning],
      '2026-09-20T06:30:00Z',
    ),
    waiting(
      'clm_132',
      'CLM-2026-0132',
      'usr_emp_006',
      'Maryam Demo',
      'Finance',
      [trip('itm_1321', '2026-09-02', '1.750'), trip('itm_1322', '2026-09-09', '2.250')],
      [],
      '2026-09-21T09:10:00Z',
    ),
    waiting(
      'clm_133',
      'CLM-2026-0133',
      'usr_emp_007',
      'Fahad Example',
      'Sales',
      [trip('itm_1331', '2026-09-04', '4.000')],
      [
        {
          code: 'POSSIBLE_DUPLICATE_RECEIPT',
          severity: 'WARNING',
          params: { fileName: 'taxi.jpg', claimNumber: 'CLM-2026-0098' },
        },
      ],
      '2026-09-22T12:45:00Z',
    ),
    approved(
      'clm_121',
      'CLM-2026-0121',
      'usr_emp_009',
      'Huda Placeholder',
      '6.500',
      '2026-09-03T10:00:00Z',
    ),
    approved(
      'clm_122',
      'CLM-2026-0122',
      'usr_emp_010',
      'Ali Mock',
      '14.250',
      '2026-09-04T11:30:00Z',
    ),
    approved(
      'clm_123',
      'CLM-2026-0123',
      'usr_emp_013',
      'Hamad Sample',
      '3.750',
      '2026-09-05T08:15:00Z',
    ),
    approved(
      'clm_124',
      'CLM-2026-0124',
      'usr_emp_014',
      'Dana Example',
      '9.000',
      '2026-09-06T13:40:00Z',
    ),
  ];
}
