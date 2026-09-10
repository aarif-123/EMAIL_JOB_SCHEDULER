import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Clock, Send, Plus, Activity, MessageSquare, LogOut, ChevronDown, Sparkles } from 'lucide-react';
import type { User } from '../types';

/** Renders user avatar: photo if provided, otherwise initials pill */
const Avatar: React.FC<{ user: User | null }> = ({ user }) => {
  if (user?.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt={user.name}
        className="w-8 h-8 rounded-full object-cover border border-gray-200 flex-shrink-0"
      />
    );
  }
  const initials = (user?.name ?? 'U')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div className="w-8 h-8 rounded-full bg-brand-600 text-white flex items-center justify-center text-[11px] font-bold flex-shrink-0 select-none">
      {initials}
    </div>
  );
};

interface SidebarProps {
  user: User | null;
  onOpenCompose: () => void;
  onOpenSlack: () => void;
  onLogout: () => void;
  scheduledCount: number | null; // null = still loading
  sentCount: number | null;
  failedCount?: number | null;
  slackConnected: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  user,
  onOpenCompose,
  onOpenSlack,
  onLogout,
  scheduledCount,
  sentCount,
  failedCount,
  slackConnected,
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const isScheduled = location.pathname.startsWith('/scheduled') || location.pathname === '/';
  const isSent = location.pathname.startsWith('/sent');
  const isQueue = location.pathname.startsWith('/queue') || location.pathname.startsWith('/admin');

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col h-screen flex-shrink-0 select-none">
      {/* App Brand Header */}
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center space-x-2.5 cursor-pointer" onClick={() => navigate('/scheduled')}>
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-white font-bold text-base shadow-sm">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="font-bold text-gray-900 tracking-tight text-base">ReachInbox</span>
            <span className="text-[10px] ml-1.5 px-1.5 py-0.5 rounded bg-brand-50 text-brand-600 font-semibold border border-brand-200">
              PRO
            </span>
          </div>
        </div>
      </div>

      {/* User Profile Card (Matches Figma Oliver Brown card) */}
      <div className="p-3 mx-3 my-3 bg-gray-50 border border-gray-200/70 rounded-xl flex items-center justify-between shadow-xs">
        <div className="flex items-center space-x-2.5 overflow-hidden">
          <Avatar user={user} />
          <div className="truncate">
            <p className="text-xs font-semibold text-gray-900 truncate">{user?.name || 'User'}</p>
            <p className="text-[11px] text-gray-500 truncate">{user?.email || 'user@domain.io'}</p>
          </div>
        </div>
        <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
      </div>

      {/* Primary Compose Action Button */}
      <div className="px-3 mb-4">
        <button
          onClick={onOpenCompose}
          className="w-full py-2.5 px-4 rounded-xl border border-brand-600 text-brand-600 hover:bg-brand-50 font-medium text-sm flex items-center justify-center space-x-2 transition-all duration-150 shadow-xs active:scale-[0.98]"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Compose</span>
        </button>
      </div>

      {/* Navigation List */}
      <div className="px-3 flex-1 overflow-y-auto space-y-1">
        <div className="px-2 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
          Core
        </div>

        {/* Scheduled Tab */}
        <button
          onClick={() => navigate('/scheduled')}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
            isScheduled
              ? 'bg-[#E6F4EA] text-brand-700 font-semibold'
              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            <Clock className={`w-4 h-4 ${isScheduled ? 'text-brand-600' : 'text-gray-400'}`} />
            <span>Scheduled</span>
          </div>
          {/* count badge: skeleton while loading, real number once ready */}
          {scheduledCount === null ? (
            <span className="w-6 h-4 rounded-full bg-gray-200 animate-pulse" />
          ) : (
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                isScheduled ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'
              }`}
            >
              {scheduledCount}
            </span>
          )}
        </button>

        {/* Sent Tab */}
        <button
          onClick={() => navigate('/sent')}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
            isSent
              ? 'bg-[#E6F4EA] text-brand-700 font-semibold'
              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            <Send className={`w-4 h-4 ${isSent ? 'text-brand-600' : 'text-gray-400'}`} />
            <span>Sent</span>
          </div>
          <div className="flex items-center space-x-1.5">
            {failedCount !== null && failedCount !== undefined && failedCount > 0 && (
              <span
                className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-700 border border-rose-200"
                title={`${failedCount} failed emails in database`}
              >
                {failedCount} failed
              </span>
            )}
            {sentCount === null ? (
              <span className="w-6 h-4 rounded-full bg-gray-200 animate-pulse" />
            ) : (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  isSent ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {sentCount}
              </span>
            )}
          </div>
        </button>

        {/* System & Integrations Category */}
        <div className="pt-4 px-2 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
          Integrations & Ops
        </div>

        {/* Slack Connection */}
        <button
          onClick={onOpenSlack}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <div className="flex items-center space-x-2.5">
            <MessageSquare className="w-4 h-4 text-gray-400" />
            <span>Slack Alerts</span>
          </div>
          <span
            className={`w-2 h-2 rounded-full ${slackConnected ? 'bg-emerald-500 ring-2 ring-emerald-100' : 'bg-gray-300'}`}
          />
        </button>

        {/* Native Queue & Engine Health Dashboard */}
        <button
          onClick={() => navigate('/queue')}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
            isQueue
              ? 'bg-[#E6F4EA] text-brand-700 font-semibold'
              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            <Activity className={`w-4 h-4 ${isQueue ? 'text-brand-600' : 'text-gray-400'}`} />
            <span>Queue & Engine</span>
          </div>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
            BullMQ
          </span>
        </button>
      </div>

      {/* Logout Footer */}
      <div className="p-3 border-t border-gray-100">
        <button
          onClick={onLogout}
          className="w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-xs text-gray-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
};
