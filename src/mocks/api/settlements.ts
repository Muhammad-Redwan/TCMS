import { http, HttpResponse } from 'msw';
import {
  FieldError,
  PaymentEvidenceWrite,
  SettlementBatch,
  SettlementBatchCreate,
  SettlementCandidate,
  SettlementExportRequest,
} from '../../app/api/models';
import { currencyDigits } from '../../app/shared/format/money';
import { MockBatch } from '../approvals-seed';
import { evaluate, fromMinor, todayIn, toMinor } from '../claims-engine';
import { MockClaim } from '../claims-seed';
import { db, MockDb, nextId, save } from '../db';
import { putFile } from '../file-store';
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
import { advanceJobs, onJobFinished, startJob } from '../jobs';

const EXPORT_TTL_DAYS = 7;
const METHODS = ['BANK_TRANSFER', 'PAYROLL', 'CHEQUE', 'CASH'];

function candidate(claim: MockClaim, store: MockDb): SettlementCandidate {
  return {
    claimId: claim.id,
    claimNumber: claim.number,
    claimantName: claim.claimantName ?? 'Employee',
    period: claim.period,
    totalAmount: evaluate(claim, store).total,
    currency: claim.currency,
    approvedAt: claim.approvedAt ?? null,
  };
}

function batchClaims(batch: MockBatch, store: MockDb): MockClaim[] {
  return batch.claimIds
    .map((id) => store.claims.find((c) => c.id === id))
    .filter((c): c is MockClaim => !!c);
}

/** Batch total computed by the "server" in integer minor units. */
function batchTotal(batch: MockBatch, store: MockDb): string {
  const digits = currencyDigits(batch.currency);
  const sum = batchClaims(batch, store).reduce(
    (acc, c) => acc + toMinor(evaluate(c, store).total, digits),
    0n,
  );
  return fromMinor(sum, digits);
}

function present(batch: MockBatch, store: MockDb): SettlementBatch {
  return {
    id: batch.id,
    number: batch.number,
    status: batch.status,
    claimCount: batch.claimIds.length,
    totalAmount: batchTotal(batch, store),
    currency: batch.currency,
    createdAt: batch.createdAt,
    claims: batchClaims(batch, store).map((c) => candidate(c, store)),
    exports: batch.exports,
    exportJobId: batch.exportJobId,
    exportErrorCode: batch.exportErrorCode,
    payment: batch.payment,
    version: batch.version,
  };
}

const withEtag = (body: SettlementBatch, status = 200) =>
  HttpResponse.json(body, { status, headers: { ETag: etagOf(body.version) } });

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

onJobFinished('SETTLEMENT_EXPORT', (store, job, succeeded) => {
  const batch = store.batches.find((b) => b.id === job.subjectId);
  if (!batch) return;
  batch.exportJobId = null;
  batch.version += 1;
  if (!succeeded) {
    Object.assign(batch, { status: 'EXPORT_FAILED', exportErrorCode: 'EXPORT_FAILED' });
    return;
  }
  const rows = [
    ['claim_number', 'claimant', 'period', 'amount', 'currency'],
    ...batchClaims(batch, store).map((c) => [
      c.number,
      c.claimantName ?? '',
      c.period,
      evaluate(c, store).total,
      c.currency,
    ]),
  ];
  // Byte-order mark so spreadsheet apps read Arabic names as UTF-8.
  const BOM = String.fromCharCode(0xfeff);
  const csv = BOM + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  const exportId = nextId('exp');
  putFile(exportId, new TextEncoder().encode(csv), 'text/csv');
  const now = new Date();
  batch.exports.unshift({
    id: exportId,
    format: (job.input?.['format'] as 'CSV' | 'XLSX') ?? 'CSV',
    fileName: `${batch.number}.csv`,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + EXPORT_TTL_DAYS * 864e5).toISOString(),
  });
  Object.assign(batch, { status: 'EXPORT_CREATED', exportErrorCode: null });
});

export const settlementHandlers = [
  http.get('/api/v1/settlements/queue', async ({ request }) => {
    await latency();
    const denied = denyUnless('settlements.read');
    if (denied) return denied;
    const store = db();
    const items = store.claims
      .filter((c) => c.status === 'APPROVED' && !c.batchId)
      .sort((a, b) => (a.approvedAt ?? '').localeCompare(b.approvedAt ?? ''))
      .map((c) => candidate(c, store));
    return HttpResponse.json(paged(items, new URL(request.url)));
  }),

  http.get('/api/v1/settlements/batches', async ({ request }) => {
    await latency();
    const denied = denyUnless('settlements.read');
    if (denied) return denied;
    const store = db();
    advanceJobs(store);
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const items = [...store.batches]
      .filter((b) => !status || b.status === status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((b) => {
        const {
          claims: _claims,
          exports: _exports,
          payment: _payment,
          ...summary
        } = present(b, store);
        void [_claims, _exports, _payment];
        return summary;
      });
    return HttpResponse.json(paged(items, url));
  }),

  http.post('/api/v1/settlements/batches', async ({ request }) => {
    await latency();
    const denied = denyUnless('settlements.export');
    if (denied) return denied;
    return idempotent(request, async () => {
      const body = (await request.json()) as SettlementBatchCreate;
      const ids = [...new Set(body.claimIds ?? [])];
      if (ids.length === 0) {
        return problem(422, 'VALIDATION_FAILED', [{ field: 'claimIds', code: 'REQUIRED' }]);
      }
      const store = db();
      const claims = ids.map((id) => store.claims.find((c) => c.id === id));
      if (claims.some((c) => !c)) return problem(404, 'NOT_FOUND');
      // Someone else batched one of them since the queue was loaded (FE-010 for finance).
      if (claims.some((c) => c!.status !== 'APPROVED' || c!.batchId)) {
        return problem(409, 'CLAIM_ALREADY_BATCHED');
      }
      const currencies = new Set(claims.map((c) => c!.currency));
      if (currencies.size > 1) return problem(422, 'MIXED_CURRENCIES');
      store.seq += 1;
      const batch: MockBatch = {
        id: nextId('bat'),
        number: `SET-${new Date().getFullYear()}-${String(store.seq).padStart(4, '0')}`,
        status: 'DRAFT',
        claimIds: ids,
        currency: [...currencies][0],
        createdAt: new Date().toISOString(),
        exports: [],
        exportJobId: null,
        exportErrorCode: null,
        payment: null,
        version: 1,
      };
      for (const claim of claims) {
        Object.assign(claim!, { status: 'READY_FOR_SETTLEMENT', batchId: batch.id });
        claim!.version += 1;
      }
      store.batches.push(batch);
      save();
      return { status: 201, body: present(batch, store) };
    });
  }),

  http.get('/api/v1/settlements/batches/:batchId', async ({ params }) => {
    await latency();
    const denied = denyUnless('settlements.read');
    if (denied) return denied;
    const store = db();
    advanceJobs(store);
    const batch = store.batches.find((b) => b.id === params['batchId']);
    return batch ? withEtag(present(batch, store)) : problem(404, 'NOT_FOUND');
  }),

  http.post('/api/v1/settlements/batches/:batchId/exports', async ({ request, params }) => {
    await latency();
    const denied = denyUnless('settlements.export');
    if (denied) return denied;
    return idempotent(request, async () => {
      const store = db();
      advanceJobs(store);
      const batch = store.batches.find((b) => b.id === params['batchId']);
      if (!batch) return problem(404, 'NOT_FOUND');
      const stale = staleUnless(request, batch.version);
      if (stale) return stale;
      if (batch.status === 'EXPORT_PENDING' || batch.status === 'PAYMENT_RECORDED') {
        return problem(409, 'BATCH_NOT_EXPORTABLE');
      }
      const body = (await request.json()) as SettlementExportRequest;
      if (body.format !== 'CSV') return problem(422, 'EXPORT_FORMAT_UNAVAILABLE');
      const job = startJob(store, 'SETTLEMENT_EXPORT', batch.id, {
        total: batch.claimIds.length,
        input: { format: body.format },
      });
      Object.assign(batch, {
        status: 'EXPORT_PENDING',
        exportJobId: job.id,
        exportErrorCode: null,
        version: batch.version + 1,
      });
      save();
      return { status: 202, body: present(batch, store) };
    });
  }),

  http.get(
    '/api/v1/settlements/batches/:batchId/exports/:exportId/download-url',
    async ({ params }) => {
      await latency();
      const denied = denyUnless('settlements.read');
      if (denied) return denied;
      const batch = db().batches.find((b) => b.id === params['batchId']);
      const file = batch?.exports.find((e) => e.id === params['exportId']);
      if (!file) return problem(404, 'NOT_FOUND');
      if (file.expiresAt && file.expiresAt < new Date().toISOString()) {
        return problem(410, 'EXPORT_EXPIRED');
      }
      const expiresAt = Date.now() + 5 * 60 * 1000;
      return HttpResponse.json({
        url: `/mock-storage/${file.id}?expires=${expiresAt}&signature=mock&download=${encodeURIComponent(file.fileName)}`,
        expiresAt: new Date(expiresAt).toISOString(),
      });
    },
  ),

  http.post('/api/v1/settlements/batches/:batchId/payment', async ({ request, params }) => {
    await latency();
    const denied = denyUnless('settlements.update');
    if (denied) return denied;
    return idempotent(request, async () => {
      const store = db();
      advanceJobs(store);
      const batch = store.batches.find((b) => b.id === params['batchId']);
      if (!batch) return problem(404, 'NOT_FOUND');
      const stale = staleUnless(request, batch.version);
      if (stale) return stale;
      if (batch.status === 'PAYMENT_RECORDED') return problem(409, 'PAYMENT_ALREADY_RECORDED');
      if (batch.status !== 'EXPORT_CREATED') return problem(409, 'PAYMENT_REQUIRES_EXPORT');
      const body = (await request.json()) as PaymentEvidenceWrite;
      const errors: FieldError[] = [];
      if (!body.reference?.trim()) errors.push({ field: 'reference', code: 'REQUIRED' });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.paidOn ?? '')) {
        errors.push({ field: 'paidOn', code: 'REQUIRED' });
      } else if (body.paidOn > todayIn(store.organization.timezone)) {
        errors.push({ field: 'paidOn', code: 'FUTURE_DATE' });
      }
      if (!METHODS.includes(body.method)) errors.push({ field: 'method', code: 'REQUIRED' });
      if (errors.length) return problem(422, 'VALIDATION_FAILED', errors);

      const me = currentPersona()!;
      const now = new Date().toISOString();
      batch.payment = {
        reference: body.reference.trim(),
        paidOn: body.paidOn,
        method: body.method,
        note: body.note?.trim() || null,
        recordedBy: me.displayName,
        recordedAt: now,
      };
      batch.status = 'PAYMENT_RECORDED';
      batch.version += 1;
      for (const claim of batchClaims(batch, store)) {
        claim.status = 'SETTLED';
        claim.timeline.push({ at: now, type: 'SETTLED', actorName: me.displayName, note: null });
        claim.version += 1;
        claim.updatedAt = now;
      }
      save();
      return { status: 200, body: present(batch, store) };
    });
  }),
];
