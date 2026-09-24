import { http, HttpResponse } from 'msw';
import {
  ApprovalDecision,
  ApprovalDecisionType,
  ApprovalRouteWrite,
  ApprovalTask,
  ApprovalView,
  FieldError,
} from '../../app/api/models';
import { currencyDigits } from '../../app/shared/format/money';
import { evaluate, presentClaim } from '../claims-engine';
import { MockClaim } from '../claims-seed';
import { db, MockDb, save } from '../db';
import {
  currentPersona,
  denyUnless,
  etagOf,
  idempotent,
  latency,
  paged,
  problem,
  staleUnless,
} from '../http-helpers';

const DECISIONS: ApprovalDecisionType[] = ['APPROVE', 'REJECT', 'REQUEST_CHANGES'];
const REASON_MAX = 1000;

function awaitingDecision(claim: MockClaim): boolean {
  return claim.status === 'SUBMITTED' || claim.status === 'UNDER_REVIEW';
}

/** The user who must decide the claim's current step, if any. */
function currentApprover(claim: MockClaim): string | null {
  if (!claim.approval || !awaitingDecision(claim)) return null;
  return claim.approval.approverIds[claim.approval.step - 1] ?? null;
}

/** Visible to anyone on the claim's route; 404 for everyone else (no existence leak). */
function visibleTo(claim: MockClaim, userId: string): boolean {
  return (
    !!claim.approval?.approverIds.includes(userId) ||
    !!claim.approval?.decisions.some((d) => d.approverId === userId)
  );
}

function allowedDecisions(claim: MockClaim, userId: string): ApprovalDecisionType[] {
  if (claim.ownerId === userId) return [];
  return currentApprover(claim) === userId ? DECISIONS : [];
}

function view(claim: MockClaim, store: MockDb, userId: string): ApprovalView {
  return {
    claim: presentClaim(claim, store),
    claimantName: claim.claimantName ?? 'Employee',
    departmentName: claim.departmentName ?? null,
    step: claim.approval?.step ?? 1,
    totalSteps: claim.approval?.approverIds.length ?? 1,
    allowedDecisions: allowedDecisions(claim, userId),
  };
}

function withEtag(body: ApprovalView) {
  return HttpResponse.json(body, { headers: { ETag: etagOf(body.claim.version) } });
}

function userName(store: MockDb, userId: string | null | undefined): string | null {
  if (!userId) return null;
  return store.users.find((u) => u.id === userId)?.displayName ?? null;
}

export const approvalHandlers = [
  http.get('/api/v1/approval-route', async () => {
    await latency();
    const denied = denyUnless('policies.read');
    if (denied) return denied;
    const route = db().approvalRoute;
    return HttpResponse.json(route, { headers: { ETag: etagOf(route.version) } });
  }),

  http.put('/api/v1/approval-route', async ({ request }) => {
    await latency();
    const denied = denyUnless('policies.write');
    if (denied) return denied;
    const store = db();
    const stale = staleUnless(request, store.approvalRoute.version);
    if (stale) return stale;
    const body = (await request.json()) as ApprovalRouteWrite;
    const errors: FieldError[] = [];
    const activeUser = (id: string | null | undefined) =>
      !!id && store.users.some((u) => u.id === id && u.status === 'ACTIVE');
    if (!['LINE_MANAGER', 'DEPARTMENT_MANAGER'].includes(body.firstApprover)) {
      errors.push({ field: 'firstApprover', code: 'REQUIRED' });
    }
    if (!activeUser(body.fallbackApproverUserId)) {
      errors.push({ field: 'fallbackApproverUserId', code: 'APPROVER_NOT_ACTIVE' });
    }
    if (body.secondApprovalAbove) {
      const digits = currencyDigits(store.organization.currency);
      const pattern = new RegExp(`^\\d+(\\.\\d{1,${digits}})?$`);
      if (!pattern.test(body.secondApprovalAbove)) {
        errors.push({ field: 'secondApprovalAbove', code: 'INVALID_AMOUNT' });
      }
      if (!activeUser(body.secondApproverUserId)) {
        errors.push({ field: 'secondApproverUserId', code: 'APPROVER_NOT_ACTIVE' });
      }
    }
    if (errors.length) return problem(422, 'VALIDATION_FAILED', errors);
    const secondEnabled = !!body.secondApprovalAbove;
    store.approvalRoute = {
      firstApprover: body.firstApprover,
      fallbackApproverUserId: body.fallbackApproverUserId,
      fallbackApproverName: userName(store, body.fallbackApproverUserId),
      secondApprovalAbove: secondEnabled ? body.secondApprovalAbove : null,
      secondApproverUserId: secondEnabled ? (body.secondApproverUserId ?? null) : null,
      secondApproverName: secondEnabled ? userName(store, body.secondApproverUserId) : null,
      version: store.approvalRoute.version + 1,
    };
    save();
    return HttpResponse.json(store.approvalRoute, {
      headers: { ETag: etagOf(store.approvalRoute.version) },
    });
  }),

  http.get('/api/v1/approvals', async ({ request }) => {
    await latency();
    const denied = denyUnless('approvals.read');
    if (denied) return denied;
    const me = currentPersona()!;
    const url = new URL(request.url);
    const decided = url.searchParams.get('state') === 'DECIDED';
    const store = db();
    const tasks: ApprovalTask[] = store.claims
      .filter((c) =>
        decided
          ? !!c.approval?.decisions.some((d) => d.approverId === me.userId)
          : currentApprover(c) === me.userId,
      )
      .map((c) => {
        const mine = [...(c.approval?.decisions ?? [])]
          .reverse()
          .find((d) => d.approverId === me.userId);
        return {
          claimId: c.id,
          claimNumber: c.number,
          claimantName: c.claimantName ?? 'Employee',
          departmentName: c.departmentName ?? null,
          period: c.period,
          totalAmount: evaluate(c, store).total,
          currency: presentClaim(c, store).currency,
          status: c.status,
          step: c.approval?.step ?? 1,
          totalSteps: c.approval?.approverIds.length ?? 1,
          warningCount: (c.submittedFindings ?? []).filter((f) => f.severity !== 'INFO').length,
          submittedAt: c.submittedAt ?? null,
          decidedAt: decided ? (mine?.at ?? null) : null,
          decision: decided ? (mine?.decision ?? null) : null,
        };
      })
      // Pending work oldest first; history newest first.
      .sort((a, b) =>
        decided
          ? (b.decidedAt ?? '').localeCompare(a.decidedAt ?? '')
          : (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''),
      );
    return HttpResponse.json(paged(tasks, url));
  }),

  http.get('/api/v1/approvals/:claimId', async ({ params }) => {
    await latency();
    const denied = denyUnless('approvals.read');
    if (denied) return denied;
    const me = currentPersona()!;
    const store = db();
    const claim = store.claims.find((c) => c.id === params['claimId']);
    if (!claim || !visibleTo(claim, me.userId)) return problem(404, 'NOT_FOUND');
    return withEtag(view(claim, store, me.userId));
  }),

  http.post('/api/v1/approvals/:claimId/decision', async ({ request, params }) => {
    await latency();
    const denied = denyUnless('approvals.decide');
    if (denied) return denied;
    return idempotent(request, async () => {
      const me = currentPersona()!;
      const store = db();
      const claim = store.claims.find((c) => c.id === params['claimId']);
      if (!claim || !visibleTo(claim, me.userId)) return problem(404, 'NOT_FOUND');
      // Separation of duties (guide §5 "Approval decision").
      if (claim.ownerId === me.userId) return problem(403, 'SELF_APPROVAL');
      const stale = staleUnless(request, claim.version);
      if (stale) return stale;
      if (currentApprover(claim) !== me.userId) return problem(409, 'ALREADY_DECIDED');

      const body = (await request.json()) as ApprovalDecision;
      if (!DECISIONS.includes(body.decision)) {
        return problem(422, 'VALIDATION_FAILED', [{ field: 'decision', code: 'REQUIRED' }]);
      }
      const reason = body.reason?.trim() || null;
      if (body.decision !== 'APPROVE' && !reason) {
        return problem(422, 'VALIDATION_FAILED', [{ field: 'reason', code: 'REQUIRED' }]);
      }
      if (reason && reason.length > REASON_MAX) {
        return problem(422, 'VALIDATION_FAILED', [{ field: 'reason', code: 'TOO_LONG' }]);
      }

      const now = new Date().toISOString();
      const approval = claim.approval!;
      approval.decisions.push({
        step: approval.step,
        approverId: me.userId,
        decision: body.decision,
        reason,
        at: now,
      });
      if (body.decision === 'APPROVE') {
        claim.timeline.push({ at: now, type: 'APPROVED', actorName: me.displayName, note: reason });
        if (approval.step < approval.approverIds.length) {
          approval.step += 1;
          claim.status = 'UNDER_REVIEW';
        } else {
          claim.status = 'APPROVED';
          claim.approvedAt = now;
          claim.batchId = null;
        }
      } else if (body.decision === 'REJECT') {
        claim.status = 'REJECTED';
        claim.timeline.push({ at: now, type: 'REJECTED', actorName: me.displayName, note: reason });
      } else {
        claim.status = 'NEEDS_CHANGES';
        claim.timeline.push({
          at: now,
          type: 'CHANGES_REQUESTED',
          actorName: me.displayName,
          note: reason,
        });
      }
      claim.version += 1;
      claim.updatedAt = now;
      save();
      return { status: 200, body: view(claim, store, me.userId) };
    });
  }),

  http.get('/api/v1/approvals/:claimId/receipts/:receiptId/download-url', async ({ params }) => {
    await latency();
    const denied = denyUnless('approvals.read');
    if (denied) return denied;
    const me = currentPersona()!;
    const claim = db().claims.find((c) => c.id === params['claimId']);
    if (!claim || !visibleTo(claim, me.userId)) return problem(404, 'NOT_FOUND');
    const receipt = claim.receipts.find((r) => r.id === params['receiptId']);
    if (!receipt) return problem(404, 'NOT_FOUND');
    if (receipt.scanStatus !== 'CLEAN') return problem(409, 'RECEIPT_NOT_AVAILABLE');
    const expiresAt = Date.now() + 5 * 60 * 1000;
    return HttpResponse.json({
      url: `/mock-storage/${receipt.id}?expires=${expiresAt}&signature=mock`,
      expiresAt: new Date(expiresAt).toISOString(),
    });
  }),
];
