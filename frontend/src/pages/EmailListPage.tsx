import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { EmailList } from '../components/EmailList';
import { emailService } from '../api/emailService';
import { toast } from 'sonner';
import type { ScheduledEmail } from '../types';

interface OutletContextType {
  searchQuery: string;
  refreshKey: number;
}

interface EmailListPageProps {
  type: 'scheduled' | 'sent';
}

export const EmailListPage: React.FC<EmailListPageProps> = ({ type }) => {
  const { searchQuery, refreshKey } = useOutletContext<OutletContextType>();
  const [emails, setEmails] = useState<ScheduledEmail[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'delivered' | 'failed'>('all');

  // Only show the skeleton on the very first load per type.
  // After that, keep stale data visible while the new fetch runs silently.
  const hasLoadedOnce = useRef(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchEmails = useCallback(async (showSkeleton: boolean) => {
    if (showSkeleton) setIsLoading(true);
    try {
      const res =
        searchQuery.trim().length > 0
          ? await emailService.search(searchQuery, type === 'scheduled' ? 'SCHEDULED' : 'SENT')
          : type === 'scheduled'
          ? await emailService.getScheduled()
          : await emailService.getSent();

      setEmails(res.emails ?? []);
      hasLoadedOnce.current = true;
    } catch {
      toast.error(`Failed to load ${type} emails`);
    } finally {
      setIsLoading(false);
    }
  }, [type, searchQuery]);

  useEffect(() => {
    // First load → show skeleton. Subsequent (search/refresh) → silent refresh.
    const showSkeleton = !hasLoadedOnce.current;
    const timer = setTimeout(() => fetchEmails(showSkeleton), 250);
    return () => clearTimeout(timer);
  }, [fetchEmails, refreshKey]);

  const deliveredCount = emails.filter((e) => e.status === 'SENT').length;
  const failedCount = emails.filter((e) => e.status === 'FAILED').length;

  const displayedEmails =
    type === 'sent' && statusFilter !== 'all'
      ? emails.filter((e) => (statusFilter === 'delivered' ? e.status === 'SENT' : e.status === 'FAILED'))
      : emails;

  return (
    <div className="flex-1 flex flex-col overflow-y-auto">
      {type === 'sent' && emails.length > 0 && (
        <div className="bg-white border-b border-gray-100 px-6 py-2.5 flex items-center space-x-2 flex-shrink-0">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              statusFilter === 'all'
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All ({emails.length})
          </button>
          <button
            onClick={() => setStatusFilter('delivered')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              statusFilter === 'delivered'
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
            }`}
          >
            Delivered ({deliveredCount})
          </button>
          <button
            onClick={() => setStatusFilter('failed')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              statusFilter === 'failed'
                ? 'bg-rose-600 text-white'
                : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
            }`}
          >
            Failed ({failedCount})
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <EmailList type={type} emails={displayedEmails} isLoading={isLoading} />
      </div>
    </div>
  );
};

