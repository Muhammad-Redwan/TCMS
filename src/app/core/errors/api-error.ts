import { HttpErrorResponse } from '@angular/common/http';
import { FieldError, Problem } from '../../api/models';

/**
 * Normalized error every feature receives from the API layer.
 * Built from an RFC 9457 ProblemDetail (D8); anything else becomes a generic error.
 * Server-provided `title`/`detail` are deliberately not kept: UI text comes from
 * translation keys derived from `code`.
 */
export interface ApiError {
  status: number;
  code: string;
  traceId?: string;
  fieldErrors: FieldError[];
  /** True when the request may have reached the server (network drop, gateway timeout). */
  outcomeUnknown: boolean;
}

const TRACE_HEADERS = ['X-Trace-Id', 'traceparent'];

export function toApiError(error: HttpErrorResponse): ApiError {
  const problem = isProblem(error.error) ? error.error : undefined;
  return {
    status: error.status,
    code: problem?.code ?? fallbackCode(error.status),
    traceId: problem?.traceId ?? readTraceHeader(error),
    fieldErrors: problem?.fieldErrors ?? [],
    outcomeUnknown: error.status === 0 || error.status === 502 || error.status === 504,
  };
}

export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ApiError).status === 'number' &&
    typeof (value as ApiError).code === 'string' &&
    Array.isArray((value as ApiError).fieldErrors)
  );
}

/** Translation key for an error code, e.g. VALIDATION_FAILED -> errors.VALIDATION_FAILED. */
export function errorMessageKey(error: ApiError): string {
  return `errors.${error.code}`;
}

function isProblem(body: unknown): body is Problem {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as Problem).code === 'string' &&
    typeof (body as Problem).status === 'number'
  );
}

function fallbackCode(status: number): string {
  if (status === 0) return 'NETWORK_ERROR';
  if (status === 401) return 'UNAUTHENTICATED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409 || status === 412) return 'CONFLICT';
  if (status === 413) return 'PAYLOAD_TOO_LARGE';
  if (status === 415) return 'UNSUPPORTED_MEDIA_TYPE';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'SERVER_ERROR';
  return 'UNKNOWN_ERROR';
}

function readTraceHeader(error: HttpErrorResponse): string | undefined {
  for (const name of TRACE_HEADERS) {
    const value = error.headers?.get(name);
    if (value) return value;
  }
  return undefined;
}
