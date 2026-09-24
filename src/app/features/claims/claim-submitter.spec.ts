import { TestBed } from '@angular/core/testing';
import { Api } from '../../api/api';
import { ApiError } from '../../core/errors/api-error';
import { ClaimSubmitter } from './claim-submitter';

const failure = (status: number, outcomeUnknown: boolean): ApiError => ({
  status,
  code: outcomeUnknown ? 'NETWORK_ERROR' : 'CLAIM_HAS_BLOCKING_FINDINGS',
  fieldErrors: [],
  outcomeUnknown,
});

describe('ClaimSubmitter (FE-015)', () => {
  let invoke$Response: ReturnType<typeof vi.fn>;
  let submitter: ClaimSubmitter;
  const keysSent = () =>
    invoke$Response.mock.calls.map(
      (call) => (call[1] as Record<string, string>)['Idempotency-Key'],
    );

  beforeEach(() => {
    invoke$Response = vi.fn();
    TestBed.configureTestingModule({
      providers: [{ provide: Api, useValue: { invoke$Response } }],
    });
    submitter = TestBed.inject(ClaimSubmitter);
  });

  it('reuses the same key after a lost response, so a retry cannot submit twice', async () => {
    invoke$Response.mockRejectedValueOnce(failure(0, true));
    invoke$Response.mockResolvedValueOnce({
      body: { id: 'clm_1', status: 'SUBMITTED', version: 2 },
      headers: new Headers({ ETag: 'W/"2"' }),
    });

    await expect(submitter.submit('clm_1', 'W/"1"')).rejects.toMatchObject({
      outcomeUnknown: true,
    });
    const result = await submitter.submit('clm_1', 'W/"1"');

    expect(keysSent()[0]).toBe(keysSent()[1]);
    expect(result.etag).toBe('W/"2"');
  });

  it('uses a new key after the server gave a definite answer', async () => {
    invoke$Response.mockRejectedValueOnce(failure(422, false));
    invoke$Response.mockRejectedValueOnce(failure(422, false));

    await expect(submitter.submit('clm_1', 'W/"1"')).rejects.toBeTruthy();
    await expect(submitter.submit('clm_1', 'W/"1"')).rejects.toBeTruthy();

    expect(keysSent()[0]).not.toBe(keysSent()[1]);
  });

  it('starts a fresh intent after a successful submit', async () => {
    const ok = { body: { id: 'clm_1', version: 2 }, headers: new Headers() };
    invoke$Response.mockResolvedValue(ok);
    await submitter.submit('clm_1', 'W/"1"');
    await submitter.submit('clm_1', 'W/"2"');
    expect(keysSent()[0]).not.toBe(keysSent()[1]);
  });

  it('keeps keys separate per claim', () => {
    expect(submitter.keyFor('clm_1')).not.toBe(submitter.keyFor('clm_2'));
    expect(submitter.keyFor('clm_1')).toBe(submitter.keyFor('clm_1'));
  });
});
