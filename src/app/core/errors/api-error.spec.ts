import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { errorMessageKey, toApiError } from './api-error';

describe('toApiError', () => {
  it('maps a ProblemDetail body including field errors by array path', () => {
    const error = toApiError(
      new HttpErrorResponse({
        status: 422,
        error: {
          status: 422,
          code: 'VALIDATION_FAILED',
          title: 'Server wording that must not reach the UI',
          traceId: 'abc123',
          fieldErrors: [{ field: 'receipts[1].amount', code: 'POSITIVE' }],
        },
      }),
    );

    expect(error).toEqual({
      status: 422,
      code: 'VALIDATION_FAILED',
      traceId: 'abc123',
      fieldErrors: [{ field: 'receipts[1].amount', code: 'POSITIVE' }],
      outcomeUnknown: false,
    });
    expect(errorMessageKey(error)).toBe('errors.VALIDATION_FAILED');
  });

  it('falls back to a status-based code and reads the trace header for non-problem bodies', () => {
    const error = toApiError(
      new HttpErrorResponse({
        status: 503,
        error: '<html>Service Unavailable</html>',
        headers: new HttpHeaders({ 'X-Trace-Id': 'trace-9' }),
      }),
    );

    expect(error.code).toBe('SERVER_ERROR');
    expect(error.traceId).toBe('trace-9');
    expect(error.fieldErrors).toEqual([]);
  });

  it.each([
    [0, 'NETWORK_ERROR', true],
    [409, 'CONFLICT', false],
    [412, 'CONFLICT', false],
    [504, 'SERVER_ERROR', true],
  ])('status %i -> %s (outcome unknown: %s)', (status, code, outcomeUnknown) => {
    const error = toApiError(new HttpErrorResponse({ status }));
    expect(error.code).toBe(code);
    expect(error.outcomeUnknown).toBe(outcomeUnknown);
  });
});
