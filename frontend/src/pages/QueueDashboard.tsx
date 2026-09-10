import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  Play,
  Pause,
  Trash2,
  RefreshCw,
  Database,
  ShieldCheck,
  Cpu,
  ExternalLink,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { adminService } from '../api/adminService';
import { StatusBadge, Button } from '../components/ui';
import type { QueueStatsResponse, QueueCounts, QueueJob } from '../types';

const EMPTY_COUNTS: QueueCounts = {
  delayed: 0, active: 0, waiting: 0, completed: 0, failed: 0, paused: 0, total: 0,
};

const JOB_FILTER_TABS = ['all', 'delayed', 'active', 'waiting', 'completed', 'failed'] as const;
type JobFilter = (typeof JOB_FILTER_TABS)[number];

export const QueueDashboard: React.FC = () => {
  const [data, setData] = useState<QueueStatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [activeFilter, setActiveFilter] = useState<JobFilter>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const result = await adminService.getQueueStats();
      setData(result);
    } catch {
      toast.error('Failed to retrieve queue telemetry');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Auto-refresh every 3.5 s — only when not already manually refreshing
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchStats, 3500);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchStats]);

  const handleManualRefresh = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    fetchStats();
  };

  const handleTogglePause = async () => {
    if (!data) return;
    try {
      if (data.queue.isPaused) {
        await adminService.resumeQueue();
        toast.success('Queue resumed successfully');
      } else {
        await adminService.pauseQueue();
        toast.warning('Queue paused — active jobs will finish; new jobs will wait.');
      }
      fetchStats();
    } catch {
      toast.error('Failed to change queue status');
    }
  };

  const handleCleanJobs = async () => {
    try {
      const result = await adminService.cleanJobs('completed');
      toast.success(result.message || 'Cleaned completed jobs');
      fetchStats();
    } catch {
      toast.error('Failed to clean completed jobs');
    }
  };

  const handleReconcile = async () => {
    try {
      await adminService.reconcile();
      toast.success('Reconciliation complete: all database jobs synced to BullMQ');
      fetchStats();
    } catch {
      toast.error('Failed to trigger reconciliation');
    }
  };

  const handleRetryFailed = async () => {
    setIsRetrying(true);
    try {
      const result = await adminService.retryFailed(100);
      toast.success(result.message || 'Re-enqueued failed emails');
      fetchStats();
    } catch {
      toast.error('Failed to retry emails');
    } finally {
      setIsRetrying(false);
    }
  };

  const filteredJobs: QueueJob[] =
    data?.jobs.filter((j) =>
      activeFilter === 'all' ? true : j.state === activeFilter
    ) ?? [];

  if (isLoading) {
    return (
      <div className="flex-1 p-8 bg-[#F9FAFB] overflow-y-auto space-y-6">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-28 bg-white rounded-2xl border border-gray-200 animate-pulse" />
          ))}
        </div>
        <div className="h-64 bg-white rounded-2xl border border-gray-200 animate-pulse" />
      </div>
    );
  }

  const counts = data?.queue.counts ?? EMPTY_COUNTS;

  return (
    <div className="flex-1 bg-[#F9FAFB] overflow-y-auto p-8 space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-brand-600 flex items-center justify-center text-white shadow-xs">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">Queue &amp; Engine Architecture</h1>
            <p className="text-xs text-gray-500">BullMQ Distributed Queue • Redis 7 AOF • Zero Cron Engine</p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {/* Retry Failed button if there are failures in DB */}
          {(data?.dbTotals?.failed ?? 0) > 0 && (
            <Button
              onClick={handleRetryFailed}
              isLoading={isRetrying}
              variant="secondary"
              size="xs"
              className="bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
              leftIcon={<RotateCcw className="w-3.5 h-3.5 text-rose-600" />}
              title="Re-enqueue failed emails from DB back into BullMQ"
            >
              Retry Failed ({data?.dbTotals.failed})
            </Button>
          )}

          {/* Pause / Resume */}
          <Button
            onClick={handleTogglePause}
            variant={data?.queue.isPaused ? 'ghost' : 'ghost'}
            size="xs"
            className={
              data?.queue.isPaused
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
            }
            leftIcon={
              data?.queue.isPaused
                ? <Play className="w-3.5 h-3.5 fill-current" />
                : <Pause className="w-3.5 h-3.5 fill-current" />
            }
          >
            {data?.queue.isPaused ? 'Resume Dispatch' : 'Pause Queue'}
          </Button>

          {/* Clean completed */}
          <Button
            onClick={handleCleanJobs}
            variant="secondary"
            size="xs"
            leftIcon={<Trash2 className="w-3.5 h-3.5 text-gray-400" />}
            title="Purge finished jobs from memory"
          >
            Clean Completed
          </Button>

          {/* Reconcile */}
          <Button
            onClick={handleReconcile}
            variant="ghost"
            size="xs"
            className="text-brand-700 bg-brand-50 border-brand-200 hover:bg-brand-100"
            leftIcon={<ShieldCheck className="w-3.5 h-3.5 text-brand-600" />}
            title="Verify DB → BullMQ synchronization"
          >
            Reconcile Sync
          </Button>

          {/* Auto-refresh toggle */}
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            title={autoRefresh ? 'Auto-refresh ON — click to pause' : 'Auto-refresh OFF — click to enable'}
            className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-xl text-[11px] font-medium border transition-colors ${autoRefresh
                ? 'bg-brand-50 text-brand-700 border-brand-200'
                : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
              }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? 'bg-brand-600 animate-pulse' : 'bg-gray-400'}`} />
            <span>{autoRefresh ? 'Live' : 'Paused'}</span>
          </button>

          {/* Manual refresh */}
          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-xl text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
            title="Refresh now"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-brand-600' : ''}`} />
          </button>

          {/* Raw Bull-Board link */}
          <a
            href="http://localhost:5000/admin/queues"
            target="_blank"
            rel="noreferrer"
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-gray-500 bg-white border border-gray-200 hover:text-gray-900 transition-colors shadow-2xs"
          >
            <span>Raw Inspector</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          {
            label: 'Delayed',
            count: counts.delayed,
            badge: data?.dbTotals ? `${data.dbTotals.scheduled} in DB` : null,
            badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
            dot: 'bg-amber-500',
            sub: 'Waiting for timestamp in Redis',
          },
          {
            label: 'Active Workers',
            count: counts.active,
            badge: `${data?.queue.concurrency ?? 5} Threads`,
            badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
            dot: 'bg-blue-500 animate-pulse',
            sub: 'Dispatched via Ethereal',
          },
          {
            label: 'Waiting in Queue',
            count: counts.waiting,
            badge: null,
            badgeClass: '',
            dot: 'bg-purple-500',
            sub: 'Ready for worker pick',
          },
          {
            label: 'Delivered',
            count: counts.completed,
            badge: data?.dbTotals ? `${data.dbTotals.sent} in DB` : null,
            badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
            dot: 'bg-emerald-500',
            sub: 'Completed & logged in audit trail',
            valueClass: 'text-emerald-600',
          },
          {
            label: 'Failed / Retrying',
            count: counts.failed,
            badge: data?.dbTotals && data.dbTotals.failed > 0 ? `${data.dbTotals.failed} in DB` : null,
            badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
            dot: 'bg-rose-500',
            sub: data?.dbTotals && data.dbTotals.failed > 0
              ? `${data.dbTotals.failed} failed in DB • Retry available`
              : 'Exponential backoff active',
            valueClass: 'text-rose-600',
          },
        ].map(({ label, count, badge, badgeClass, dot, sub, valueClass }) => (
          <div key={label} className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{label}</span>
              <div className={`w-2 h-2 rounded-full ${dot}`} />
            </div>
            <div className="flex items-baseline justify-between">
              <div className={`text-2xl font-bold ${valueClass ?? 'text-gray-900'}`}>{count}</div>
              {badge && (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badgeClass}`}>
                  {badge}
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-400">{sub}</p>
          </div>
        ))}
      </div>

      {/* Infrastructure Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center text-red-600 flex-shrink-0">
            <Database className="w-5 h-5" />
          </div>
          <div className="overflow-hidden">
            <div className="flex items-center space-x-1.5">
              <span className="text-xs font-bold text-gray-900">Redis 7 AOF Persistence</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">ACTIVE</span>
            </div>
            <p className="text-[11px] text-gray-500 truncate">
              Memory: {data?.redis.usedMemory} • Port: {data?.redis.port} • Append-only on disk
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-200 flex items-center justify-center text-brand-600 flex-shrink-0">
            <Cpu className="w-5 h-5" />
          </div>
          <div className="overflow-hidden">
            <div className="flex items-center space-x-1.5">
              <span className="text-xs font-bold text-gray-900">Worker Concurrency</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-brand-50 text-brand-700 border border-brand-200">5 THREADS</span>
            </div>
            <p className="text-[11px] text-gray-500 truncate">
              Min delay {data?.queue.minEmailDelayMs}ms • Per-sender Redis Lua limiter
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 flex-shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="overflow-hidden">
            <div className="flex items-center space-x-1.5">
              <span className="text-xs font-bold text-gray-900">Two-Tier Idempotency</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">ENABLED</span>
            </div>
            <p className="text-[11px] text-gray-500 truncate">Custom Job ID + Atomic Postgres Conditional Claim</p>
          </div>
        </div>
      </div>

      {/* Jobs Table */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
        {/* Filter tabs */}
        <div className="p-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-1">
            {JOB_FILTER_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveFilter(tab)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium capitalize transition-colors ${activeFilter === tab
                    ? 'bg-[#E6F4EA] text-brand-700 font-semibold'
                    : 'text-gray-500 hover:bg-gray-100'
                  }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <span className="text-xs text-gray-400">{filteredJobs.length} jobs</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50/80 text-[11px] text-gray-400 uppercase font-semibold border-b border-gray-100">
              <tr>
                <th className="px-6 py-3">Job ID</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Recipient / Subject</th>
                <th className="px-6 py-3">Sender</th>
                <th className="px-6 py-3">Timing / Delay</th>
                <th className="px-6 py-3">Attempts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-700">
              {filteredJobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-400 italic">
                    No jobs matching filter &ldquo;{activeFilter}&rdquo;
                  </td>
                </tr>
              ) : (
                filteredJobs.map((job) => (
                  <tr key={job.id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="px-6 py-3.5 font-mono text-[11px] text-gray-500 truncate max-w-[140px]">
                      {job.id}
                    </td>
                    <td className="px-6 py-3.5">
                      <StatusBadge status={job.state} />
                    </td>
                    <td className="px-6 py-3.5">
                      <p className="font-semibold text-gray-900 truncate max-w-[200px]">
                        {job.recipientEmail ?? job.id}
                      </p>
                      <p className="text-[11px] text-gray-400 truncate max-w-[200px]">
                        {job.subject ?? '—'}
                      </p>
                    </td>
                    <td className="px-6 py-3.5 text-gray-500 font-mono text-[11px]">
                      {job.senderEmail ?? '—'}
                    </td>
                    <td className="px-6 py-3.5 text-gray-500 text-[11px]">
                      {job.state === 'delayed' && job.delayRemainingMs > 0 ? (
                        <span className="font-medium text-amber-700">
                          Executes in {Math.round(job.delayRemainingMs / 1000)}s
                        </span>
                      ) : job.finishedOn ? (
                        format(new Date(job.finishedOn), 'MMM d, h:mm a')
                      ) : (
                        'Queued'
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-gray-500 font-mono text-[11px]">
                      {job.attemptsMade} / 3
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
