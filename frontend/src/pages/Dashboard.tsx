import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { ComposeModal } from '../components/ComposeModal';
import { SlackModal } from '../components/SlackModal';
import { emailService } from '../api/emailService';
import { api } from '../api/client';
import type { User, SenderAccount, EmailStats } from '../types';

interface DashboardProps {
  user: User;
  onLogout: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ user, onLogout }) => {
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [senders, setSenders] = useState<SenderAccount[]>([]);
  const [stats, setStats] = useState<EmailStats | null>(null);
  const [slackConnected, setSlackConnected] = useState<boolean>(
    user.slackConfig?.isConnected || false
  );

  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [isSlackOpen, setIsSlackOpen] = useState(false);

  // Fetch Senders
  const fetchSenders = useCallback(async () => {
    try {
      const data = await emailService.getSenders();
      setSenders(data);
    } catch {
      // Non-critical: senders list failing shouldn't block the whole UI
    }
  }, []);

  // Fetch Stats & Slack status — surface failures once via console (UI continues working)
  const fetchStats = useCallback(async () => {
    try {
      const [statsRes, slackRes] = await Promise.all([
        emailService.getStats(),
        api.get<{ isConnected: boolean }>('/slack/status'),
      ]);
      setStats(statsRes);
      setSlackConnected(slackRes.data.isConnected);
    } catch {
      // Stats are background data — tolerate transient failures silently
    }
  }, []);

  useEffect(() => {
    fetchSenders();
    fetchStats();
  }, [fetchSenders, fetchStats]);

  // Reset search on tab change — deferred so the unmounting page's fetch isn't
  // interrupted mid-request by a sudden searchQuery="" change.
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(''), 50);
    return () => clearTimeout(t);
  }, [location.pathname]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setRefreshKey((k) => k + 1);
    await fetchStats();
    setIsRefreshing(false);
  };

  // Determine Title based on current route
  let activeTabTitle = 'Scheduled Emails';
  if (location.pathname.startsWith('/sent')) {
    activeTabTitle = 'Sent Emails';
  } else if (location.pathname.startsWith('/email/')) {
    activeTabTitle = 'Email Details';
  } else if (location.pathname.startsWith('/queue') || location.pathname.startsWith('/admin')) {
    activeTabTitle = 'Queue & Engine Architecture';
  }

  return (
    <div className="flex h-screen bg-[#F9FAFB] overflow-hidden">
      {/* Left Sidebar matching Figma */}
      <Sidebar
        user={user}
        onOpenCompose={() => setIsComposeOpen(true)}
        onOpenSlack={() => setIsSlackOpen(true)}
        onLogout={onLogout}
        scheduledCount={stats?.scheduledCount ?? null}
        sentCount={stats?.sentCount ?? null}
        failedCount={stats?.failedCount ?? null}
        slackConnected={slackConnected}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <Header
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          activeTabTitle={activeTabTitle}
        />

        {/* Dynamic Nested Content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <Outlet context={{ searchQuery, refreshKey }} />
        </main>
      </div>

      {/* Compose Modal */}
      <ComposeModal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
        senders={senders}
        currentUserEmail={user.email}
        onSendersUpdated={fetchSenders}
        onScheduledSuccess={() => {
          handleRefresh();
        }}
      />

      {/* Slack Integration Modal */}
      <SlackModal
        isOpen={isSlackOpen}
        onClose={() => setIsSlackOpen(false)}
        onStatusUpdated={() => {
          fetchStats();
        }}
      />
    </div>
  );
};
