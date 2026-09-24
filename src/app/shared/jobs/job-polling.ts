import { inject, Service } from '@angular/core';
import { defer, expand, from, Observable, switchMap, takeWhile, timer } from 'rxjs';
import { Api } from '../../api/api';
import { getJob } from '../../api/functions';
import { Job } from '../../api/models';

const FIRST_DELAY_MS = 1000;
const MAX_DELAY_MS = 15000;

export function isTerminal(job: Job): boolean {
  return job.status === 'SUCCEEDED' || job.status === 'FAILED';
}

/** Delay before poll number `attempt` (0-based): 1s, 2s, 4s, 8s, then 15s (guide §4 "Jobs"). */
export function pollDelay(attempt: number): number {
  return Math.min(FIRST_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
}

/**
 * Emits the job on every poll until it succeeds or fails, backing off between polls.
 * Unsubscribing (e.g. takeUntilDestroyed on navigation) stops polling; the job ID stays in the
 * resource, so a reload resumes from the server state (FE-016).
 */
@Service()
export class JobPoller {
  private readonly api = inject(Api);

  watch(jobId: string): Observable<Job> {
    let attempt = 0;
    const fetch = () => defer(() => from(this.api.invoke(getJob, { jobId })));
    return fetch().pipe(
      expand((job) =>
        isTerminal(job) ? [] : timer(pollDelay(attempt++)).pipe(switchMap(() => fetch())),
      ),
      takeWhile((job) => !isTerminal(job), true),
    );
  }
}
