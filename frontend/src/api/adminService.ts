import { api } from './client';
import type { QueueStatsResponse } from '../types';

export interface CleanJobsResponse {
  message: string;
  cleaned: number;
}

export interface ReconcileResponse {
  message: string;
  recovered: number;
}

export const adminService = {
  getQueueStats(): Promise<QueueStatsResponse> {
    return api.get<QueueStatsResponse>('/admin/queue-stats').then((r) => r.data);
  },

  pauseQueue(): Promise<{ message: string }> {
    return api.post<{ message: string }>('/admin/queue/pause').then((r) => r.data);
  },

  resumeQueue(): Promise<{ message: string }> {
    return api.post<{ message: string }>('/admin/queue/resume').then((r) => r.data);
  },

  cleanJobs(type: 'completed' | 'failed' = 'completed'): Promise<CleanJobsResponse> {
    return api.post<CleanJobsResponse>('/admin/queue/clean', { type }).then((r) => r.data);
  },

  reconcile(): Promise<ReconcileResponse> {
    return api.post<ReconcileResponse>('/admin/queue/reconcile').then((r) => r.data);
  },

  retryFailed(limit: number = 100): Promise<{ message: string; retriedCount: number }> {
    return api.post<{ message: string; retriedCount: number }>('/admin/retry-failed', { limit }).then((r) => r.data);
  },
};
