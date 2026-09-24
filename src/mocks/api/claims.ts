import { http, HttpResponse } from 'msw';
import {
  ClaimItem,
  ClaimWrite,
  FieldError,
  ReceiptUploadPolicy,
  ReceiptUploadRequest,
} from '../../app/api/models';
import { currencyDigits } from '../../app/shared/format/money';
import {
  advanceScans,
  evaluate,
  fingerprint,
  isEditable,
  presentClaim,
  presentReceipt,
  sniffContentType,
} from '../claims-engine';
import { MockClaim } from '../claims-seed';
import { db, nextId, save } from '../db';
import { deleteFile, getFile, putFile } from '../file-store';
import {
  currentPersona,
  denyUnless,
  etagOf,
  idempotent,
  latency,
  matches,
  paged,
  problem,
  staleUnless,
} from '../http-helpers';

export const UPLOAD_POLICY: ReceiptUploadPolicy = {
  maxFileSizeBytes: 5 * 1024 * 1024,
  allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  maxReceiptsPerClaim: 20,
};
const URL_TTL_MS = 5 * 60 * 1000;
const MODES = ['TAXI', 'RIDE_HAILING', 'BUS', 'METRO', 'PERSONAL_CAR', 'OTHER'];

const withEtag = (body: { version: number }, status = 200) =>
  HttpResponse.json(body, { status, headers: { ETag: etagOf(body.version) } });

/** The caller's own claim, or a 404 that does not reveal whether it exists for someone else. */
function ownClaim(id: unknown): MockClaim | null {
  const me = currentPersona();
  const claim = db().claims.find((c) => c.id === id);
  return claim && me && claim.ownerId === me.userId ? claim : null;
}

function touch(claim: MockClaim): void {
  claim.version += 1;
  claim.updatedAt = new Date().toISOString();
}

export const claimHandlers = [
  http.get('/api/v1/claims/upload-policy', async () => {
    await latency();
    return denyUnless('claims.create') ?? HttpResponse.json(UPLOAD_POLICY);
  }),

  http.get('/api/v1/claims', async ({ request }) => {
    await latency();
    const denied = denyUnless('claims.own.read');
    if (denied) return denied;
    const me = currentPersona()!;
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const period = url.searchParams.get('period');
    const store = db();
    const summaries = store.claims
      .filter(
        (c) =>
          c.ownerId === me.userId && (!status || c.status === status) && matches(c.period, period),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((c) => ({
        id: c.id,
        number: c.number,
        status: c.status,
        period: c.period,
        currency: presentClaim(c, store).currency,
        totalAmount: evaluate(c, store).total,
        itemCount: c.items.length,
        submittedAt: c.submittedAt ?? null,
        updatedAt: c.updatedAt,
      }));
    return HttpResponse.json(paged(summaries, url));
  }),

  http.post('/api/v1/claims', async ({ request }) => {
    await latency();
    const denied = denyUnless('claims.create');
    if (denied) return denied;
    return idempotent(request, async () => {
      const body = (await request.json()) as ClaimWrite;
      const store = db();
      const errors = validate(body, store.organization.currency);
      if (errors.length) return problem(422, 'VALIDATION_FAILED', errors);
      const me = currentPersona()!;
      store.seq += 1;
      const claim: MockClaim = {
        id: nextId('clm'),
        number: `CLM-${body.period.slice(0, 4)}-${String(store.seq).padStart(4, '0')}`,
        ownerId: me.userId,
        status: 'DRAFT',
        period: body.period,
        currency: store.organization.currency,
        policyId: null,
        policyVersion: null,
        items: toItems(body),
        receipts: [],
        timeline: [
          { at: new Date().toISOString(), type: 'CREATED', actorName: me.displayName, note: null },
        ],
        submittedAt: null,
        updatedAt: new Date().toISOString(),
        version: 1,
      };
      store.claims.push(claim);
      save();
      return { status: 201, body: presentClaim(claim, store) };
    });
  }),

  http.get('/api/v1/claims/:claimId', async ({ params }) => {
    await latency();
    const denied = denyUnless('claims.own.read');
    if (denied) return denied;
    const claim = ownClaim(params['claimId']);
    if (!claim) return problem(404, 'NOT_FOUND');
    if (advanceScans(claim)) save();
    return withEtag(presentClaim(claim, db()));
  }),

  http.put('/api/v1/claims/:claimId', async ({ request, params }) => {
    await latency();
    const denied = denyUnless('claims.create');
    if (denied) return denied;
    const claim = ownClaim(params['claimId']);
    if (!claim) return problem(404, 'NOT_FOUND');
    const stale = staleUnless(request, claim.version);
    if (stale) return stale;
    if (!isEditable(claim)) return problem(409, 'CLAIM_NOT_EDITABLE');
    const body = (await request.json()) as ClaimWrite;
    const store = db();
    const errors = validate(body, store.organization.currency, claim);
    if (errors.length) return problem(422, 'VALIDATION_FAILED', errors);
    claim.period = body.period;
    claim.items = toItems(body, claim.items);
    touch(claim);
    save();
    return withEtag(presentClaim(claim, store));
  }),

  http.delete('/api/v1/claims/:claimId', async ({ request, params }) => {
    await latency();
    const denied = denyUnless('claims.create');
    if (denied) return denied;
    const claim = ownClaim(params['claimId']);
    if (!claim) return problem(404, 'NOT_FOUND');
    const stale = staleUnless(request, claim.version);
    if (stale) return stale;
    if (claim.status !== 'DRAFT') return problem(409, 'CLAIM_NOT_EDITABLE');
    const store = db();
    claim.receipts.forEach((r) => deleteFile(r.id));
    store.claims = store.claims.filter((c) => c.id !== claim.id);
    save();
    return new HttpResponse(null, { status: 204 });
  }),

  http.post('/api/v1/claims/:claimId/submit', async ({ request, params }) => {
    await latency();
    const denied = denyUnless('claims.create');
    if (denied) return denied;
    return idempotent(request, async () => {
      const claim = ownClaim(params['claimId']);
      if (!claim) return problem(404, 'NOT_FOUND');
      const stale = staleUnless(request, claim.version);
      if (stale) return stale;
      if (!isEditable(claim)) return problem(409, 'CLAIM_NOT_EDITABLE');
      const store = db();
      advanceScans(claim);
      if (evaluate(claim, store).findings.some((f) => f.severity === 'BLOCKING')) {
        return problem(422, 'CLAIM_HAS_BLOCKING_FINDINGS');
      }
      const me = currentPersona()!;
      const resubmission = claim.status === 'NEEDS_CHANGES';
      claim.status = 'SUBMITTED';
      claim.submittedAt = new Date().toISOString();
      claim.timeline.push({
        at: claim.submittedAt,
        type: resubmission ? 'RESUBMITTED' : 'SUBMITTED',
        actorName: me.displayName,
        note: null,
      });
      touch(claim);
      save();
      return { status: 200, body: presentClaim(claim, store) };
    });
  }),

  http.post('/api/v1/claims/:claimId/receipts/upload-url', async ({ request, params }) => {
    await latency();
    const denied = denyUnless('claims.create');
    if (denied) return denied;
    return idempotent(request, async () => {
      const claim = ownClaim(params['claimId']);
      if (!claim) return problem(404, 'NOT_FOUND');
      if (!isEditable(claim)) return problem(409, 'CLAIM_NOT_EDITABLE');
      const body = (await request.json()) as ReceiptUploadRequest;
      if (!UPLOAD_POLICY.allowedContentTypes.includes(body.contentType)) {
        return problem(415, 'UNSUPPORTED_MEDIA_TYPE');
      }
      if (body.sizeBytes > UPLOAD_POLICY.maxFileSizeBytes) return problem(413, 'PAYLOAD_TOO_LARGE');
      if (claim.receipts.length >= UPLOAD_POLICY.maxReceiptsPerClaim) {
        return problem(422, 'TOO_MANY_RECEIPTS');
      }
      const receiptId = nextId('rct');
      const expiresAt = Date.now() + URL_TTL_MS;
      claim.receipts.push({
        id: receiptId,
        fileName: body.fileName.slice(0, 200),
        contentType: body.contentType,
        sizeBytes: body.sizeBytes,
        scanStatus: 'AWAITING_UPLOAD',
        rejectionCode: null,
        duplicateOfClaimNumber: null,
        uploadedAt: new Date().toISOString(),
        meta: {
          expectedContentType: body.contentType,
          expectedSize: body.sizeBytes,
          uploaded: false,
        },
      });
      save();
      return {
        status: 201,
        body: {
          receiptId,
          uploadUrl: `/mock-storage/${receiptId}?expires=${expiresAt}&signature=mock`,
          method: 'PUT',
          headers: { 'Content-Type': body.contentType },
          expiresAt: new Date(expiresAt).toISOString(),
        },
      };
    });
  }),

  http.post('/api/v1/claims/:claimId/receipts/:receiptId/complete', async ({ params }) => {
    await latency();
    const denied = denyUnless('claims.create');
    if (denied) return denied;
    const claim = ownClaim(params['claimId']);
    const receipt = claim?.receipts.find((r) => r.id === params['receiptId']);
    if (!claim || !receipt) return problem(404, 'NOT_FOUND');
    if (receipt.scanStatus !== 'AWAITING_UPLOAD') return HttpResponse.json(presentReceipt(receipt));
    const file = getFile(receipt.id);
    if (!file || !receipt.meta.uploaded) return problem(409, 'UPLOAD_NOT_FOUND');
    const hash = fingerprint(file.bytes);
    const duplicate = db()
      .claims.filter((c) => c.ownerId === claim.ownerId)
      .flatMap((c) => c.receipts.map((r) => ({ claim: c, r })))
      .find(({ r }) => r.id !== receipt.id && r.meta.hash === hash);
    Object.assign(receipt, {
      scanStatus: 'SCANNING',
      duplicateOfClaimNumber: duplicate?.claim.number ?? null,
      meta: {
        ...receipt.meta,
        scanStartedAt: Date.now(),
        hash,
        sniffedType: sniffContentType(file.bytes),
      },
    });
    touch(claim);
    save();
    return HttpResponse.json(presentReceipt(receipt));
  }),

  http.get('/api/v1/claims/:claimId/receipts/:receiptId', async ({ params }) => {
    await latency();
    const denied = denyUnless('claims.own.read');
    if (denied) return denied;
    const claim = ownClaim(params['claimId']);
    const receipt = claim?.receipts.find((r) => r.id === params['receiptId']);
    if (!claim || !receipt) return problem(404, 'NOT_FOUND');
    if (advanceScans(claim)) save();
    return HttpResponse.json(presentReceipt(receipt));
  }),

  http.delete('/api/v1/claims/:claimId/receipts/:receiptId', async ({ params }) => {
    await latency();
    const denied = denyUnless('claims.create');
    if (denied) return denied;
    const claim = ownClaim(params['claimId']);
    if (!claim || !claim.receipts.some((r) => r.id === params['receiptId'])) {
      return problem(404, 'NOT_FOUND');
    }
    if (!isEditable(claim)) return problem(409, 'CLAIM_NOT_EDITABLE');
    claim.receipts = claim.receipts.filter((r) => r.id !== params['receiptId']);
    claim.items.forEach((i) => {
      if (i.receiptId === params['receiptId']) i.receiptId = null;
    });
    deleteFile(String(params['receiptId']));
    touch(claim);
    save();
    return new HttpResponse(null, { status: 204 });
  }),

  http.get('/api/v1/claims/:claimId/receipts/:receiptId/download-url', async ({ params }) => {
    await latency();
    const denied = denyUnless('claims.own.read');
    if (denied) return denied;
    const claim = ownClaim(params['claimId']);
    const receipt = claim?.receipts.find((r) => r.id === params['receiptId']);
    if (!claim || !receipt) return problem(404, 'NOT_FOUND');
    if (receipt.scanStatus !== 'CLEAN') return problem(409, 'RECEIPT_NOT_AVAILABLE');
    const expiresAt = Date.now() + URL_TTL_MS;
    return HttpResponse.json({
      url: `/mock-storage/${receipt.id}?expires=${expiresAt}&signature=mock`,
      expiresAt: new Date(expiresAt).toISOString(),
    });
  }),

  // Presigned object storage: honours expiry, Content-Type and declared size like S3 would.
  http.put('/mock-storage/:receiptId', async ({ request, params }) => {
    const url = new URL(request.url);
    if (Number(url.searchParams.get('expires')) < Date.now()) {
      return new HttpResponse('Request has expired', { status: 403 });
    }
    const receipt = db()
      .claims.flatMap((c) => c.receipts)
      .find((r) => r.id === params['receiptId']);
    if (!receipt) return new HttpResponse('NoSuchUpload', { status: 404 });
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (request.headers.get('Content-Type') !== receipt.meta.expectedContentType) {
      return new HttpResponse('SignatureDoesNotMatch', { status: 403 });
    }
    if (bytes.length !== receipt.meta.expectedSize) {
      return new HttpResponse('Size mismatch', { status: 400 });
    }
    putFile(receipt.id, bytes, receipt.meta.expectedContentType);
    receipt.meta.uploaded = true;
    save();
    return new HttpResponse(null, { status: 200 });
  }),

  http.get('/mock-storage/:receiptId', ({ request, params }) => {
    const url = new URL(request.url);
    if (Number(url.searchParams.get('expires')) < Date.now()) {
      return new HttpResponse('Request has expired', { status: 403 });
    }
    const file = getFile(String(params['receiptId']));
    if (!file) return new HttpResponse('NoSuchKey', { status: 404 });
    return new HttpResponse(file.bytes, {
      headers: { 'Content-Type': file.type, 'Content-Disposition': 'inline' },
    });
  }),
];

function toItems(body: ClaimWrite, previous: ClaimItem[] = []): ClaimItem[] {
  return body.items.map((item, index) => ({
    id: previous[index]?.id ?? nextId('itm'),
    tripDate: item.tripDate,
    mode: item.mode,
    fromLocation: item.fromLocation.trim(),
    toLocation: item.toLocation.trim(),
    purpose: item.purpose?.trim() || null,
    amount: item.amount,
    receiptId: item.receiptId ?? null,
  }));
}

/** Structural checks (400/422). Policy rules are findings, not validation errors. */
function validate(body: ClaimWrite, currency: string, claim?: MockClaim): FieldError[] {
  const errors: FieldError[] = [];
  const digits = currencyDigits(currency);
  const amount = new RegExp(digits ? `^\\d+(\\.\\d{1,${digits}})?$` : '^\\d+$');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(body.period ?? ''))
    errors.push({ field: 'period', code: 'REQUIRED' });
  (body.items ?? []).forEach((item, i) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.tripDate ?? ''))
      errors.push({ field: `items[${i}].tripDate`, code: 'REQUIRED' });
    if (!MODES.includes(item.mode)) errors.push({ field: `items[${i}].mode`, code: 'REQUIRED' });
    if (!item.fromLocation?.trim())
      errors.push({ field: `items[${i}].fromLocation`, code: 'REQUIRED' });
    if (!item.toLocation?.trim())
      errors.push({ field: `items[${i}].toLocation`, code: 'REQUIRED' });
    if (!amount.test(item.amount ?? '') || !/[1-9]/.test(item.amount ?? '')) {
      errors.push({ field: `items[${i}].amount`, code: 'INVALID_AMOUNT' });
    }
    if (item.receiptId && !claim?.receipts.some((r) => r.id === item.receiptId)) {
      errors.push({ field: `items[${i}].receiptId`, code: 'NOT_FOUND' });
    }
  });
  return errors;
}
