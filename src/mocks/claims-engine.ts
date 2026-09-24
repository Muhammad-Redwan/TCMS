import { Claim, ClaimAction, PolicyFinding, Receipt } from '../app/api/models';
import { currencyDigits } from '../app/shared/format/money';
import { APPROVER_ID } from './approvals-seed';
import { MockClaim, MockPolicy, MockReceipt } from './claims-seed';
import { MockDb } from './db';

/**
 * Stand-in for the backend's claim rules. It exists so the UI can be built and tested against
 * realistic behaviour; the real rules live in the backend and may differ.
 */

const SCAN_MS = 2000;

/** Exact decimal arithmetic in integer minor units (no floating point). */
export function toMinor(amount: string, digits: number): bigint {
  const [whole, fraction = ''] = amount.split('.');
  return BigInt(whole + fraction.padEnd(digits, '0').slice(0, digits));
}

export function fromMinor(value: bigint, digits: number): string {
  const negative = value < 0n;
  const text = (negative ? -value : value).toString().padStart(digits + 1, '0');
  const result = digits === 0 ? text : `${text.slice(0, -digits)}.${text.slice(-digits)}`;
  return negative ? `-${result}` : result;
}

export function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** The published policy in force for a claim month. */
export function policyFor(period: string, policies: MockPolicy[]): MockPolicy | undefined {
  const monthStart = `${period}-01`;
  return policies
    .filter((p) => p.status === 'PUBLISHED' && p.effectiveFrom <= monthStart)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
}

/** Moves SCANNING receipts to CLEAN or REJECTED once the simulated scan time has passed. */
export function advanceScans(claim: MockClaim): boolean {
  let changed = false;
  for (const receipt of claim.receipts) {
    if (receipt.scanStatus !== 'SCANNING' || !receipt.meta.scanStartedAt) continue;
    if (Date.now() - receipt.meta.scanStartedAt < SCAN_MS) continue;
    changed = true;
    if (/virus|eicar/i.test(receipt.fileName)) {
      Object.assign(receipt, { scanStatus: 'REJECTED', rejectionCode: 'MALWARE_DETECTED' });
    } else if (receipt.meta.sniffedType && receipt.meta.sniffedType !== receipt.contentType) {
      // The bytes are not what the extension and declared type claim (guide §4 "Files").
      Object.assign(receipt, { scanStatus: 'REJECTED', rejectionCode: 'CONTENT_TYPE_MISMATCH' });
    } else {
      receipt.scanStatus = 'CLEAN';
    }
  }
  return changed;
}

function editable(claim: MockClaim): boolean {
  return claim.status === 'DRAFT' || claim.status === 'NEEDS_CHANGES';
}

export function allowedActions(claim: MockClaim): ClaimAction[] {
  if (claim.status === 'DRAFT') return ['EDIT', 'SUBMIT', 'DELETE'];
  if (claim.status === 'NEEDS_CHANGES') return ['EDIT', 'SUBMIT'];
  return [];
}

export function evaluate(
  claim: MockClaim,
  db: MockDb,
): { total: string; findings: PolicyFinding[] } {
  const policy = policyFor(claim.period, db.policies);
  const currency = policy?.currency ?? claim.currency;
  const digits = currencyDigits(currency);
  const findings: PolicyFinding[] = [];
  const total = claim.items.reduce((sum, i) => sum + toMinor(i.amount, digits), 0n);

  if (!editable(claim)) return { total: fromMinor(total, digits), findings };

  if (!policy) {
    findings.push({ code: 'NO_POLICY_IN_FORCE', severity: 'BLOCKING' });
    return { total: fromMinor(total, digits), findings };
  }
  if (claim.items.length === 0) findings.push({ code: 'NO_ITEMS', severity: 'BLOCKING' });

  const today = todayIn(db.organization.timezone);
  claim.items.forEach((item, itemIndex) => {
    const amount = toMinor(item.amount, digits);
    if (item.tripDate > today)
      findings.push({ code: 'FUTURE_DATE', severity: 'BLOCKING', itemIndex });
    if (!item.tripDate.startsWith(claim.period)) {
      findings.push({ code: 'DATE_OUTSIDE_PERIOD', severity: 'BLOCKING', itemIndex });
    }
    if (!policy.allowedModes.includes(item.mode)) {
      findings.push({ code: 'MODE_NOT_ALLOWED', severity: 'BLOCKING', itemIndex });
    }
    if (amount > toMinor(policy.perTripLimit, digits)) {
      findings.push({
        code: 'PER_TRIP_LIMIT_EXCEEDED',
        severity: 'WARNING',
        itemIndex,
        params: { limit: policy.perTripLimit },
      });
    }
    const receipt = claim.receipts.find((r) => r.id === item.receiptId);
    if (!receipt && amount > toMinor(policy.receiptRequiredAbove, digits)) {
      findings.push({
        code: 'RECEIPT_REQUIRED',
        severity: 'BLOCKING',
        itemIndex,
        params: { threshold: policy.receiptRequiredAbove },
      });
    }
    if (receipt && receipt.scanStatus !== 'CLEAN') {
      findings.push({ code: 'RECEIPT_NOT_READY', severity: 'BLOCKING', itemIndex });
    }
  });

  for (const receipt of claim.receipts) {
    if (receipt.duplicateOfClaimNumber) {
      findings.push({
        code: 'POSSIBLE_DUPLICATE_RECEIPT',
        severity: 'WARNING',
        params: { fileName: receipt.fileName, claimNumber: receipt.duplicateOfClaimNumber },
      });
    }
  }

  if (total > toMinor(policy.monthlyLimit, digits)) {
    findings.push({
      code: 'MONTHLY_LIMIT_EXCEEDED',
      severity: 'WARNING',
      params: { limit: policy.monthlyLimit },
    });
  }

  if (claim.status === 'DRAFT') {
    const [year, month] = claim.period.split('-').map(Number);
    const deadline = new Date(Date.UTC(year, month, policy.submissionDeadlineDays));
    if (today > deadline.toISOString().slice(0, 10)) {
      findings.push({
        code: 'SUBMISSION_DEADLINE_PASSED',
        severity: 'BLOCKING',
        params: { deadline: deadline.toISOString().slice(0, 10) },
      });
    }
  }
  return { total: fromMinor(total, digits), findings };
}

export function presentReceipt(receipt: MockReceipt): Receipt {
  const { meta: _meta, ...rest } = receipt;
  void _meta;
  return rest;
}

/** What the API returns: private fields removed, server-calculated values filled in. */
export function presentClaim(claim: MockClaim, db: MockDb): Claim {
  const evaluation = evaluate(claim, db);
  const total = evaluation.total;
  // After submission the reviewer and the employee see the findings recorded at submit time.
  const findings = editable(claim) ? evaluation.findings : (claim.submittedFindings ?? []);
  const {
    ownerId: _owner,
    receipts,
    claimantName: _name,
    departmentName: _department,
    approval: _approval,
    submittedFindings: _submitted,
    approvedAt: _approvedAt,
    batchId: _batch,
    ...rest
  } = claim;
  void [_owner, _name, _department, _approval, _submitted, _approvedAt, _batch];
  const policy = policyFor(claim.period, db.policies);
  return {
    ...rest,
    currency: policy?.currency ?? claim.currency,
    policyId: policy?.id ?? null,
    policyVersion: policy?.version ?? null,
    totalAmount: total,
    receipts: receipts.map(presentReceipt),
    findings,
    allowedActions: allowedActions(claim),
  };
}

/**
 * Approvers for a claim, fixed at submission: the line manager (the Approver Demo persona in
 * mock mode), or the fallback approver when the claimant is that manager; plus a second
 * approver above the configured amount. Nobody is ever routed their own claim.
 */
export function resolveApprovers(db: MockDb, ownerId: string, total: string): string[] {
  const route = db.approvalRoute;
  const first = ownerId === APPROVER_ID ? route.fallbackApproverUserId : APPROVER_ID;
  const approvers = [first];
  const digits = currencyDigits(db.organization.currency);
  if (
    route.secondApprovalAbove &&
    route.secondApproverUserId &&
    route.secondApproverUserId !== ownerId &&
    route.secondApproverUserId !== first &&
    toMinor(total, digits) > toMinor(route.secondApprovalAbove, digits)
  ) {
    approvers.push(route.secondApproverUserId);
  }
  return approvers;
}

export function isEditable(claim: MockClaim): boolean {
  return editable(claim);
}

/** Recognises common receipt formats from their first bytes. */
export function sniffContentType(bytes: Uint8Array): string | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (starts(0x89, 0x50, 0x4e, 0x47)) return 'image/png';
  if (starts(0x25, 0x50, 0x44, 0x46)) return 'application/pdf';
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45) return 'image/webp';
  return null;
}

/** FNV-1a fingerprint; enough to spot the same file uploaded twice in mock mode. */
export function fingerprint(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16) + ':' + bytes.length;
}
