import { delay, HttpResponse } from 'msw';
import { FieldError } from '../app/api/models';
import { PERSONA_STORAGE_KEY, PERSONAS } from './personas';
import { db, save } from './db';

/** Simulated network latency so loading states are visible in mock mode. */
export const latency = () => delay(250);

export function problem(status: number, code: string, fieldErrors?: FieldError[]) {
  return HttpResponse.json(
    {
      type: 'about:blank',
      title: code,
      status,
      code,
      traceId: `mock-${Math.random().toString(16).slice(2, 10)}`,
      ...(fieldErrors ? { fieldErrors } : {}),
    },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );
}

export function currentPersona() {
  const key = localStorage.getItem(PERSONA_STORAGE_KEY);
  return key ? PERSONAS[key] : undefined;
}

/** Returns an error response when the signed-in persona lacks every listed permission. */
export function denyUnless(...anyOf: string[]) {
  const me = currentPersona();
  if (!me) return problem(401, 'UNAUTHENTICATED');
  return anyOf.some((p) => me.permissions.includes(p)) ? null : problem(403, 'FORBIDDEN');
}

export const etagOf = (version: number) => `W/"${version}"`;

/** 412 when the client's If-Match no longer matches the stored version (FE-010). */
export function staleUnless(request: Request, version: number) {
  const ifMatch = request.headers.get('If-Match');
  if (!ifMatch) return problem(428, 'PRECONDITION_REQUIRED');
  return ifMatch === etagOf(version) ? null : problem(412, 'CONFLICT');
}

export function withEtag<T extends { version: number }>(body: T, status = 200) {
  return HttpResponse.json(body, { status, headers: { ETag: etagOf(body.version) } });
}

/**
 * Replays the stored response for a repeated Idempotency-Key (FE-015), otherwise runs `create`
 * and remembers its result.
 */
export async function idempotent(
  request: Request,
  create: () => Promise<{ status: number; body: unknown } | Response>,
): Promise<Response> {
  const key = request.headers.get('Idempotency-Key');
  if (!key) return problem(400, 'IDEMPOTENCY_KEY_REQUIRED');
  const store = db();
  const stored = store.idempotency[key];
  if (stored) return HttpResponse.json(stored.body as object, { status: stored.status });
  const result = await create();
  if (result instanceof Response) return result;
  store.idempotency[key] = result;
  save();
  return HttpResponse.json(result.body as object, { status: result.status });
}

/** Spring Data PagedModel-shaped page with server-side sort and paging. */
export function paged<T>(items: T[], url: URL) {
  const page = Math.max(0, Number(url.searchParams.get('page') ?? 0) || 0);
  const size = Math.min(100, Math.max(1, Number(url.searchParams.get('size') ?? 20) || 20));
  const sort = url.searchParams.get('sort');
  let sorted = items;
  if (sort) {
    const [field, direction] = sort.split(',');
    const factor = direction === 'desc' ? -1 : 1;
    sorted = [...items].sort((a, b) => {
      const x = String((a as Record<string, unknown>)[field] ?? '');
      const y = String((b as Record<string, unknown>)[field] ?? '');
      return x.localeCompare(y, undefined, { numeric: true }) * factor;
    });
  }
  return {
    content: sorted.slice(page * size, page * size + size),
    page: {
      size,
      number: page,
      totalElements: items.length,
      totalPages: Math.ceil(items.length / size),
    },
  };
}

export function matches(text: string | null | undefined, q: string | null): boolean {
  return !q || (text ?? '').toLocaleLowerCase().includes(q.toLocaleLowerCase());
}

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
