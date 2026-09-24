import { inject, Service } from '@angular/core';
import { Api } from '../../api/api';
import { submitClaim } from '../../api/functions';
import { Claim } from '../../api/models';
import { isApiError } from '../../core/errors/api-error';
import { newIdempotencyKey, versioned, Versioned } from '../../core/http/versioned';

/**
 * Submits claims with one Idempotency-Key per submit intent (FE-015):
 * - outcome unknown (network drop, gateway timeout): the key is kept, so a retry cannot submit
 *   twice; the caller should re-read the claim before offering the retry;
 * - definite answer (success or a 4xx/5xx the server returned): the key is discarded.
 */
@Service()
export class ClaimSubmitter {
  private readonly api = inject(Api);
  private readonly keys = new Map<string, string>();

  async submit(claimId: string, etag: string): Promise<Versioned<Claim>> {
    const key = this.keyFor(claimId);
    try {
      const response = await this.api.invoke$Response(submitClaim, {
        claimId,
        'If-Match': etag,
        'Idempotency-Key': key,
      });
      this.keys.delete(claimId);
      return versioned(response);
    } catch (error) {
      if (!isApiError(error) || !error.outcomeUnknown) this.keys.delete(claimId);
      throw error;
    }
  }

  /** Visible for tests: the key the next submit of this claim will use. */
  keyFor(claimId: string): string {
    let key = this.keys.get(claimId);
    if (!key) {
      key = newIdempotencyKey();
      this.keys.set(claimId, key);
    }
    return key;
  }
}
