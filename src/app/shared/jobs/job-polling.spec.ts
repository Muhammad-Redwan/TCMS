import { TestBed } from '@angular/core/testing';
import { Api } from '../../api/api';
import { Job } from '../../api/models';
import { JobPoller, pollDelay } from './job-polling';

const job = (status: Job['status'], processed = 0): Job => ({
  id: 'job_1',
  type: 'TENANT_PROVISIONING',
  status,
  processed,
  total: 4,
  updatedAt: '2026-09-24T06:00:00Z',
});

describe('job polling (guide §4 "Jobs")', () => {
  it('backs off 1s, 2s, 4s, 8s, then stays at 15s', () => {
    expect([0, 1, 2, 3, 4, 10].map(pollDelay)).toEqual([1000, 2000, 4000, 8000, 15000, 15000]);
  });

  describe('JobPoller', () => {
    let responses: Job[];
    let invoke: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      vi.useFakeTimers();
      responses = [job('QUEUED'), job('RUNNING', 2), job('SUCCEEDED', 4)];
      invoke = vi.fn(() => Promise.resolve(responses.shift()!));
      TestBed.configureTestingModule({ providers: [{ provide: Api, useValue: { invoke } }] });
    });

    afterEach(() => vi.useRealTimers());

    it('emits each state, waits between polls, and completes on a terminal status', async () => {
      const seen: string[] = [];
      let completed = false;
      TestBed.inject(JobPoller)
        .watch('job_1')
        .subscribe({ next: (j) => seen.push(j.status), complete: () => (completed = true) });

      await vi.advanceTimersByTimeAsync(0);
      expect(seen).toEqual(['QUEUED']);
      expect(invoke).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(999);
      expect(invoke).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(seen).toEqual(['QUEUED', 'RUNNING']);

      await vi.advanceTimersByTimeAsync(2000);
      expect(seen).toEqual(['QUEUED', 'RUNNING', 'SUCCEEDED']);
      expect(completed).toBe(true);

      await vi.advanceTimersByTimeAsync(60000);
      expect(invoke).toHaveBeenCalledTimes(3);
    });

    it('stops polling when the caller unsubscribes (navigation)', async () => {
      const subscription = TestBed.inject(JobPoller).watch('job_1').subscribe();
      await vi.advanceTimersByTimeAsync(0);
      subscription.unsubscribe();
      await vi.advanceTimersByTimeAsync(60000);
      expect(invoke).toHaveBeenCalledTimes(1);
    });
  });
});
