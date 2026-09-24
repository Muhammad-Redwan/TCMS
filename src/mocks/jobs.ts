import { http, HttpResponse } from 'msw';
import { Job } from '../app/api/models';
import { db, MockDb, nextId, save } from './db';
import { latency, problem } from './http-helpers';

/** Job with the timing and outcome details only the mock "backend" knows. */
export type MockJob = Job & {
  startedAt: number;
  fails: boolean;
  /** Id of the resource the job works on (tenant, settlement batch, ...). */
  subjectId: string;
  /** Extra input, e.g. the export format. */
  input?: Record<string, string>;
};

/** Timeline in mock mode: queued 1.5 s, then running with progress until 6 s. */
const QUEUED_MS = 1500;
const DONE_MS = 6000;

type FinishHook = (store: MockDb, job: MockJob, succeeded: boolean) => void;
const finishHooks = new Map<Job['type'], FinishHook>();

/** Each job type registers what happens to its subject when the job ends. */
export function onJobFinished(type: Job['type'], hook: FinishHook): void {
  finishHooks.set(type, hook);
}

export function startJob(
  store: MockDb,
  type: Job['type'],
  subjectId: string,
  options: { total: number; fails?: boolean; input?: Record<string, string> },
): MockJob {
  const job: MockJob = {
    id: nextId('job'),
    type,
    status: 'QUEUED',
    processed: 0,
    total: options.total,
    errorCode: null,
    updatedAt: new Date().toISOString(),
    startedAt: Date.now(),
    fails: options.fails ?? false,
    subjectId,
    input: options.input,
  };
  store.jobs.push(job);
  return job;
}

/** Moves every running job forward according to elapsed time; call before reading subjects. */
export function advanceJobs(store: MockDb): void {
  let changed = false;
  for (const job of store.jobs) {
    if (job.status === 'SUCCEEDED' || job.status === 'FAILED') continue;
    const elapsed = Date.now() - job.startedAt;
    if (elapsed < QUEUED_MS) continue;
    const total = job.total ?? 1;
    if (elapsed < DONE_MS) {
      const processed = Math.min(
        total - 1,
        Math.floor(((elapsed - QUEUED_MS) / (DONE_MS - QUEUED_MS)) * total),
      );
      if (job.status !== 'RUNNING' || job.processed !== processed) {
        Object.assign(job, { status: 'RUNNING', processed, updatedAt: new Date().toISOString() });
        changed = true;
      }
      continue;
    }
    changed = true;
    const succeeded = !job.fails;
    Object.assign(job, {
      status: succeeded ? 'SUCCEEDED' : 'FAILED',
      processed: succeeded ? total : job.processed,
      errorCode: succeeded ? null : `${job.type}_FAILED`,
      updatedAt: new Date().toISOString(),
    });
    finishHooks.get(job.type)?.(store, job, succeeded);
  }
  if (changed) save();
}

export const jobHandlers = [
  http.get('/api/v1/jobs/:jobId', async ({ params }) => {
    await latency();
    const store = db();
    advanceJobs(store);
    const job = store.jobs.find((j) => j.id === params['jobId']);
    if (!job) return problem(404, 'NOT_FOUND');
    // Only the contract fields leave the mock; timing internals stay private.
    const publicJob: Job = {
      id: job.id,
      type: job.type,
      status: job.status,
      processed: job.processed,
      total: job.total,
      errorCode: job.errorCode,
      updatedAt: job.updatedAt,
    };
    return HttpResponse.json(publicJob);
  }),
];
