import { StrictHttpResponse } from '../../api/strict-http-response';

/**
 * A resource plus the ETag the server sent with it. Updates send the ETag back as If-Match,
 * so a concurrent change is rejected with 412 instead of being overwritten (guide §4).
 */
export interface Versioned<T> {
  data: T;
  etag: string;
}

/**
 * ETag for a resource version when no header is available (list rows, or a proxy that strips it).
 * Contract proposal: the backend emits weak ETags of the form W/"<version>".
 */
export function etagFromVersion(version: number): string {
  return `W/"${version}"`;
}

export function versioned<T extends { version?: number }>(
  response: StrictHttpResponse<T>,
): Versioned<T> {
  const etag = response.headers.get('ETag') ?? etagFromVersion(response.body.version ?? 0);
  return { data: response.body, etag };
}

/**
 * Stable key per user intent (guide §4 "Idempotency"). Create one when a form opens,
 * reuse it on retries of the same submit, and replace it only after success.
 */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
